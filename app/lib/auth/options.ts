import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.image = user.image;
        token.id = user.id;
      }

      if (trigger === "update" && session?.user) {
        token.image = session.user.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        // @ts-expect-error: token.sub is not in the default SessionUser type
        session.user.id = token.sub;
        // @ts-expect-error: token.image type mismatch
        session.user.image = token.image || null;
      }
      return session;
    },
  },
};
