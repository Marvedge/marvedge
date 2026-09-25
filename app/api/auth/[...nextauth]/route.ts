import { prisma } from "@/app/lib/prisma";
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";

const DUMMY_PASSWORD_HASH = "$2b$12$i4krTZOz2MpeU7SRmliVOuVWic5MtVADHyf2L4yhRVylEt3tX2T1C";
const INVALID_CREDENTIALS_ERROR = "Invalid email or password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}

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

          // Always perform a bcrypt comparison so missing accounts and incorrect
          // passwords have comparable response times.
          const passwordHash = user?.password || DUMMY_PASSWORD_HASH;
          const valid = await bcrypt.compare(credentials.password, passwordHash);

          if (!user || !user.password || !valid) {
            throw new Error(INVALID_CREDENTIALS_ERROR);
          }

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

            if (err.message === INVALID_CREDENTIALS_ERROR) {
              throw err;
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
      try {
        if (trigger === "update") {
          if (session?.user?.image) {
            token.picture = session.user.image;
          }
          if (session?.user?.name) {
            token.name = session.user.name;
          }
        }
        if (user) {
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
          token.picture = user.image || null;
        }
        return token;
      } catch (error) {
        console.error("JWT callback error:", error);
        return token;
      }
    },

    async session({ session, token }) {
      try {
        if (session?.user) {
          session.user.id = (token.id as string) || (token.sub as string) || "";
          session.user.email = (token.email as string) || "";
          session.user.name = (token.name as string) || "";
          session.user.image = (token.picture as string | null) || null;
        }
        return session;
      } catch (error) {
        console.error("Session callback error:", error);
        return session;
      }
    },

    async redirect({ url, baseUrl }) {
      try {
        if (url === baseUrl || url === "/") {
          return "/dashboard";
        }
        if (url.includes("/dashboard")) {
          return "/dashboard";
        }
        return baseUrl;
      } catch (error) {
        console.error("Redirect callback error:", error);
        return baseUrl;
      }
    },
  },

  // Optional: debug mode
  debug: process.env.NODE_ENV !== "production",
});

export { handler as GET, handler as POST };
