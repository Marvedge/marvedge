import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

export async function POST(req: Request) {
  const { email, otp, password, confirmPassword } = await req.json();
  console.log("Reset request received:", { email, otp, password: "***", confirmPassword: "***" });
  
  if (!email || !otp || !password || !confirmPassword) {
    console.log("Missing required fields");
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }
  if (password !== confirmPassword) {
    console.log("Passwords do not match");
    return NextResponse.json(
      { error: "Passwords do not match" },
      { status: 400 }
    );
  }

  // Find the verification token
  const token = await prisma.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier: email,
        token: otp,
      },
    },
  });
  console.log("Token found:", !!token, "Token expires:", token?.expires);
  
  if (!token || token.expires < new Date()) {
    console.log("Invalid or expired token");
    return NextResponse.json(
      { error: "Invalid or expired OTP" },
      { status: 400 }
    );
  }

  // Find the user
  const user = await prisma.user.findUnique({ where: { email } });
  console.log("User found:", !!user, "User has password:", !!user?.password);
  
  if (!user || !user.password) {
    console.log("User not found or no password");
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if new password is same as old
  const isSame = await bcrypt.compare(password, user.password);
  console.log("New password same as old:", isSame);
  
  if (isSame) {
    console.log("New password cannot be same as old");
    return NextResponse.json(
      { error: "New password cannot be the same as the old password" },
      { status: 400 }
    );
  }

  // Hash and update the password
  const hashedPassword = await bcrypt.hash(password, 12);
  console.log("Password hashed, updating user...");
  
  try {
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
    console.log("User updated successfully:", updatedUser.id);
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 }
    );
  }

  // Delete the used OTP
  try {
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token: otp,
        },
      },
    });
    console.log("OTP token deleted successfully");
  } catch (error) {
    console.error("Error deleting OTP token:", error);
  }

  console.log("Password reset completed successfully");
  return NextResponse.json({ message: "Password reset successful" });
}
