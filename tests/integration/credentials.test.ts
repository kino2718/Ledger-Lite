import { describe, expect, test } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { authorizeCredentials } from "@/lib/credentials";

// Credentials の照合ロジックを実 test.db + 実 bcrypt で検証する統合テスト。
// test.db は global-setup でスキーマ作成、setup.ts で毎回クリアされる。
describe("authorizeCredentials", () => {
  // 既知のパスワードを持つユーザーを 1 件作る。
  async function createUser() {
    return prisma.user.create({
      data: {
        email: "alice@example.com",
        passwordHash: await hashPassword("correct-password"),
        displayName: "Alice",
      },
    });
  }

  test("正しいメールとパスワードならユーザー情報を返す", async () => {
    await createUser();

    const result = await authorizeCredentials({
      email: "alice@example.com",
      password: "correct-password",
    });

    expect(result).not.toBeNull();
    expect(result?.email).toBe("alice@example.com");
    expect(result?.name).toBe("Alice");
    // id は文字列で返す慣例（setup.ts のリセットで id は 1 から）。
    expect(result?.id).toBe("1");
    expect(typeof result?.id).toBe("string");
  });

  test("パスワードが誤っていれば null", async () => {
    await createUser();

    const result = await authorizeCredentials({
      email: "alice@example.com",
      password: "wrong-password",
    });

    expect(result).toBeNull();
  });

  test("存在しないメールなら null", async () => {
    const result = await authorizeCredentials({
      email: "nobody@example.com",
      password: "whatever",
    });

    expect(result).toBeNull();
  });

  test("email / password が文字列でなければ null", async () => {
    expect(await authorizeCredentials({})).toBeNull();
    expect(
      await authorizeCredentials({ email: "alice@example.com" }),
    ).toBeNull();
    expect(await authorizeCredentials({ email: 123, password: 456 })).toBeNull();
  });
});
