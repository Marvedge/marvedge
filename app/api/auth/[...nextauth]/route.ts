import { prisma } from "@/app/lib/prisma";
import NextAuth from "next-auth";
import bcrypt from "bcrypt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";


const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "email", type: "text", placeholder: "" },
        password: { label: "password", type: "password", placeholder: "" },
      },
      async authorize(credentials) {
        console.log("NextAuth authorize called with email:", credentials?.email);

        const user = await prisma.user.findUnique({
          where: { email: credentials?.email },
        });

        console.log("User found:", !!user, "User has password:", !!user?.password);

        if (!user || !user.password) {
          console.log("No user found or no password");
          throw new Error("No user found");
        }

        const valid = await bcrypt.compare(
          credentials!.password,
          user.password
        );
        console.log("Password validation result:", valid);
        
        if (!valid) {
          console.log("Invalid password");
          throw new Error("Invalid password");
        }

        console.log("Authentication successful for user:", user.id);
        return user;
      },
    }),
  ],
  //Current session strategy is set to use jwt, entry in the Session table will only be created when set to "database"
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url === baseUrl || url === "/") return "/";
      if (url === `${baseUrl}/dashboard` || url === "/dashboard")
        return "/dashboard";
      if (url.includes("signout") || url.includes("signin")) return "/";
      return "/dashboard";
    },
  },
});

export { handler as GET, handler as POST };
