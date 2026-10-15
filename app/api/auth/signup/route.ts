import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { createHash } from "node:crypto";

const SIGNUP_SUCCESS_MESSAGE =
  "If this email is available, your account has been created. You can now sign in.";

function signupResponse() {
  return NextResponse.json({ message: SIGNUP_SUCCESS_MESSAGE }, { status: 200 });
}

function signupEmailKey(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { name, email, password } = body || {};

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Trim once and reuse below: the check above must judge the same address
    // the lookup and save use. Case is left alone on purpose so existing
    // mixed-case accounts keep working.
    const cleanEmail = email.trim();
    const cleanName = typeof name === "string" ? name.trim() : "";

    if (!cleanName) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded
      ? forwarded.split(",")[0].trim()
      : req.headers.get("x-real-ip")?.trim() || "unknown";
    const emailKey = signupEmailKey(cleanEmail);

    const [ipLimited, emailLimited] = await Promise.all([
      isRateLimited(`signup:ip:${ip}`, 20, 900, true),
      isRateLimited(`signup:email:${emailKey}`, 5, 900, true),
    ]);

    if (ipLimited || emailLimited) {
      return NextResponse.json(
        { error: "Too many attempts, please try again later" },
        { status: 429 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (password.length > 72) {
      return NextResponse.json({ error: "Password is too long" }, { status: 400 });
    }

    // Perform the expensive hash for both existing and new accounts so response
    // timing does not immediately reveal whether the email is registered.
    const hashedPassword = await bcrypt.hash(password, 12);

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: cleanEmail,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      return signupResponse();
    }

    try {
      await prisma.user.create({
        data: {
          name: cleanName,
          email: cleanEmail.toLowerCase(),
          password: hashedPassword,
        },
      });
    } catch (error) {
      // A concurrent signup may create the same account after our lookup.
      // Return the same response so the unique constraint cannot become an
      // account-enumeration oracle.
      if (isUniqueConstraintError(error)) {
        return signupResponse();
      }

      throw error;
    }

    return signupResponse();
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
