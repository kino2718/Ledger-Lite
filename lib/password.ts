import bcrypt from "bcryptjs";

// パスワードのハッシュ化・照合を一箇所に集約する。
// seed（保存時）と auth.ts の authorize（ログイン照合時）の両方から使う。

// bcrypt のコストパラメータ。大きいほど安全だが遅くなる。10〜12 が一般的。
const SALT_ROUNDS = 12;

/** 平文パスワードを bcrypt ハッシュ（"$2b$..." 形式）にする。 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 平文がハッシュと一致するかを照合する。 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
