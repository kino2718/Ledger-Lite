import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // 本番モード（next start）では既定で Host ヘッダを信頼せず、認証が全部
  // 拒否される（UntrustedHost エラー）。このアプリはローカル・単一ユーザー
  // 前提で、Host を偽装できる人＝利用者本人しかいないため信頼してよい。
  // インターネットに公開する構成へ変える場合はこの前提が崩れるので、
  // Host を検証するリバースプロキシを前段に置くか AUTH_URL で固定すること。
  trustHost: true,
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
      // 照合ロジックは lib/credentials.ts に切り出してテスト可能にしている。
      authorize: (credentials) => authorizeCredentials(credentials),
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
