import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Credentials ではセッションは JWT 方式（DB セッション/アダプタは併用不可）。
  session: { strategy: "jwt" },
  // 既定の /api/auth/signin ではなく自作のログインページを使う。
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // email でユーザーを取得し、bcrypt で平文と保存ハッシュを照合する。
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Auth.js に渡すユーザー情報。id は文字列が慣例。
        return {
          id: String(user.id),
          email: user.email,
          name: user.displayName,
        };
      },
    }),
  ],
  callbacks: {
    // 初回サインイン時に user.id を JWT に載せる。
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    // JWT の id をセッションへ反映し、session.user.id で参照できるようにする。
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
