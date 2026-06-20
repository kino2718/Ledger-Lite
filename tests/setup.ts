import { beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

// 各テストの前にテーブルを空にして、テスト間の独立性を保つ。
// onDelete: Restrict があるため、外部キーの依存順（子→親）に削除する。
beforeEach(async () => {
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.subAccount.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  // autoincrement のカウンタもリセットし、毎回 id=1 から始まるようにする。
  await prisma.$executeRaw`DELETE FROM sqlite_sequence`;
});
