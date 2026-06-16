import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

// Credentials provider の authorize 本体。email + password を照合し、
// 成功時は Auth.js に渡すユーザー情報、失敗時は null を返す。
// auth.ts のインライン定義から切り出し、単体（統合）テスト可能にしたもの。
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
) {
  const email = credentials.email;
  const password = credentials.password;
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
}
