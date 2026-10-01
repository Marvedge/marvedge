import NextAuth from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

// Single shared config lives in app/lib/auth/options.ts. This route only
// serves it, so sign-in and every getServerSession check use the same setup.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
