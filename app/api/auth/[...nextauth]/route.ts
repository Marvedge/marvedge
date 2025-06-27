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
        console.log("authorizing");

        const user = await prisma.user.findUnique({
          where: { email: credentials?.email },
        });

        if (!user || !user.password) throw new Error("No user found");

        const valid = await bcrypt.compare(
          credentials!.password,
          user.password
        );
        if (!valid) throw new Error("Invalid password");

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
