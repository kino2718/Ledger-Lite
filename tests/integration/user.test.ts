import { describe, expect, test } from "vitest";
import { prisma } from "@/lib/prisma";

// Prisma + better-sqlite3 アダプタを通した統合テスト。
// テスト DB（test.db）は global-setup でスキーマ作成、setup.ts で毎回クリアされる。
describe("User model", () => {
  test("ユーザーを作成でき、id は number で返る", async () => {
    const user = await prisma.user.create({
      data: {
        email: "alice@example.com",
        passwordHash: "hash",
        displayName: "Alice",
      },
    });

    // setup.ts で sqlite_sequence をリセットしているので id は 1 から。
    expect(user.id).toBe(1);
    // bigint→number 正規化（lib/prisma.ts の result 拡張）が効いていること。
    expect(typeof user.id).toBe("number");
    expect(user.email).toBe("alice@example.com");
    // JSON 化が落ちない（bigint だと throw する）ことの確認。
    expect(() => JSON.stringify(user)).not.toThrow();
  });

  test("@default(now()) と @updatedAt が設定される", async () => {
    const user = await prisma.user.create({
      data: { email: "bob@example.com", passwordHash: "hash" },
    });

    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
    // displayName は任意なので未指定なら null。
    expect(user.displayName).toBeNull();
  });

  test("email の unique 制約に違反すると失敗する", async () => {
    await prisma.user.create({
      data: { email: "dup@example.com", passwordHash: "hash" },
    });

    await expect(
      prisma.user.create({
        data: { email: "dup@example.com", passwordHash: "hash2" },
      }),
    ).rejects.toThrow();
  });
});
