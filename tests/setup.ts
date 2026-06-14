import { beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// 各テストの前にテーブルを空にして、テスト間の独立性を保つ。
// モデルが増えたら、外部キーの依存順（子→親）に delete を追加する。
beforeEach(async () => {
  await prisma.user.deleteMany();
  // autoincrement のカウンタもリセットし、毎回 id=1 から始まるようにする。
  await prisma.$executeRaw`DELETE FROM sqlite_sequence WHERE name = 'User'`;
});
