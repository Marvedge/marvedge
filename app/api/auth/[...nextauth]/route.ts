import { prisma } from "@/app/lib/prisma";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Email/Password Credentials
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Email and password are required");
          }

          // Attempt to fetch user from DB
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user || !user.password) {
            console.log("❌ No user found in DB:", credentials.email);
            throw new Error("No user found with this email");
          }

          // Verify password
          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) {
            console.log("❌ Invalid password for user:", credentials.email);
            throw new Error("Invalid password");
          }

          console.log("✅ User authorized:", user.email);
          return user;
        } catch (err: unknown) {
          if (err instanceof Error) {
            if (
              err.message.includes("Can't reach database server") ||
              err.message.includes("ECONNREFUSED")
            ) {
              console.error("💥 Database connection error:", err);
              throw new Error("Database connection failed. Try again later.");
            }

            console.error("💥 Credentials error:", err);
            throw err;
          } else {
            console.error("💥 Unknown error:", err);
            throw new Error("An unknown error occurred");
          }
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },
  // Remove the unused directive
  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Persist user info to token when user is first authenticated
      if (trigger === "update" && session?.user?.image) {
        token.picture = session.user.image;
      }
      if (user) {
        console.log("user info", user);
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image || null;
      }
      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        console.log("session info", session);
        // Add token info to session
        // @ts-expect-error: `id` property does not exist on session.user by default, but we add it for frontend use
        session.user.id = token.id || token.sub;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.picture;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Handle redirects safely
      if (url === baseUrl || url === "/") {
        return "/dashboard";
      }
      if (url.includes("/dashboard")) {
        return "/dashboard";
      }
      return baseUrl;
    },
  },

  // Optional: debug mode
  debug: process.env.NODE_ENV !== "production",
});

export { handler as GET, handler as POST };
