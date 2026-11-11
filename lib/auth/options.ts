import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDb } from "@/db/client";
import { writeAudit } from "@/lib/audit";
import { loginLimiter } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/users/schemas";
import { authenticate } from "@/lib/users/service";

export const RATE_LIMITED = "RATE_LIMITED";

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const v = headers?.[name];
  return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials ?? {});
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = headerValue(req?.headers, "x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (!loginLimiter.consume(`${email}|${ip}`).allowed) throw new Error(RATE_LIMITED);

        const db = await getDb();
        const userId = await authenticate(db, email, password);
        await writeAudit(db, {
          actorUserId: userId,
          action: userId ? "auth.login" : "auth.login_failed",
          entityType: "auth",
          entityId: userId,
          after: userId ? null : { email },
        });
        if (!userId) return null;
        loginLimiter.reset(`${email}|${ip}`);
        return { id: userId, email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user = { ...session.user, id: token.uid };
      return session;
    },
  },
};
