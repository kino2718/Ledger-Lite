import { describe, expect, test, vi } from "vitest";

// create.ts は "server-only" を読み込むためテストでは空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntry,
} from "@/lib/journal/create";
import type {
  JournalEntryInput,
  JournalLineInput,
} from "@/lib/journal/validation";

// テスト用のユーザーと勘定科目を用意する。
async function setup() {
  const user = await prisma.user.create({
    data: { email: "alice@example.com", passwordHash: "hash" },
  });
  const cash = await prisma.account.create({
    data: { userId: user.id, code: "100", name: "現金", accountType: "asset" },
  });
  const sales = await prisma.account.create({
    data: { userId: user.id, code: "400", name: "売上高", accountType: "revenue" },
  });
  const utility = await prisma.account.create({
    data: {
      userId: user.id,
      code: "401",
      name: "水道光熱費",
      accountType: "expense",
      subAccounts: { create: [{ name: "電気" }] },
    },
    include: { subAccounts: true },
  });
  return { user, cash, sales, utility, electricSub: utility.subAccounts[0] };
}

function entry(
  lines: JournalLineInput[],
  overrides: { entryDate?: string; description?: string | null } = {},
): JournalEntryInput {
  return {
    entryDate: overrides.entryDate ?? "2026-06-20",
    description: overrides.description ?? "テスト取引",
    lines,
  };
}

// 検証を通る素直な仕訳（現金 / 売上 各 amount 円）を作って ID を返す。
async function seedEntry(
  userId: number,
  cashId: number,
  salesId: number,
  amount = 1000,
) {
  const result = await createJournalEntry(
    userId,
    entry([
      { accountId: cashId, subAccountId: null, side: "debit", amount },
      { accountId: salesId, subAccountId: null, side: "credit", amount },
    ]),
  );
  if (!result.ok) throw new Error("seed に失敗");
  return result.id;
}

describe("updateJournalEntry", () => {
  test("ヘッダーと明細を入力どおりに置き換える", async () => {
    const { user, cash, sales, utility, electricSub } = await setup();
    const id = await seedEntry(user.id, cash.id, sales.id, 1000);

    const result = await updateJournalEntry(
      user.id,
      id,
      entry(
        [
          {
            accountId: utility.id,
            subAccountId: electricSub.id,
            side: "debit",
            amount: 8000,
          },
          { accountId: cash.id, subAccountId: null, side: "credit", amount: 8000 },
        ],
        { entryDate: "2026-06-25", description: "電気料金" },
      ),
    );

    expect(result.ok).toBe(true);

    const saved = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(saved?.entryDate).toBe("2026-06-25");
    expect(saved?.description).toBe("電気料金");
    // 旧明細は残らず、新しい明細だけが lineNo 1 始まりで並ぶ。
    expect(saved?.lines).toHaveLength(2);
    expect(saved?.lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(saved?.lines[0]).toMatchObject({
      accountId: utility.id,
      subAccountId: electricSub.id,
      side: "debit",
      amount: 8000,
    });
    // DB 全体でも明細は 2 行（旧 2 行が消えている）。
    expect(await prisma.journalLine.count()).toBe(2);
  });

  test("貸借が一致しないと更新せずエラーを返す", async () => {
    const { user, cash, sales } = await setup();
    const id = await seedEntry(user.id, cash.id, sales.id, 1000);

    const result = await updateJournalEntry(
      user.id,
      id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 1000 },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 900 },
      ]),
    );

    expect(result.ok).toBe(false);
    // 元の明細はそのまま（金額 1000）。
    const saved = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    expect(saved?.lines.every((l) => l.amount === 1000)).toBe(true);
  });

  test("他ユーザーの仕訳は更新できずエラーを返す", async () => {
    const { user, cash, sales } = await setup();
    const id = await seedEntry(user.id, cash.id, sales.id, 1000);
    const bob = await prisma.user.create({
      data: { email: "bob@example.com", passwordHash: "hash" },
    });

    const result = await updateJournalEntry(
      bob.id,
      id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 5000 },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 5000 },
      ]),
    );

    expect(result.ok).toBe(false);
    // alice の仕訳は変わらない。
    const saved = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    expect(saved?.lines.every((l) => l.amount === 1000)).toBe(true);
  });

  test("存在しない ID はエラーを返す", async () => {
    const { user } = await setup();
    const result = await updateJournalEntry(
      user.id,
      9999,
      entry([
        { accountId: 1, subAccountId: null, side: "debit", amount: 1000 },
        { accountId: 2, subAccountId: null, side: "credit", amount: 1000 },
      ]),
    );
    expect(result.ok).toBe(false);
  });
});

describe("deleteJournalEntry", () => {
  test("仕訳を削除すると明細も連動して消える（Cascade）", async () => {
    const { user, cash, sales } = await setup();
    const id = await seedEntry(user.id, cash.id, sales.id, 1000);
    expect(await prisma.journalLine.count()).toBe(2);

    const result = await deleteJournalEntry(user.id, id);

    expect(result.ok).toBe(true);
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.journalLine.count()).toBe(0);
  });

  test("他ユーザーの仕訳は削除できない", async () => {
    const { user, cash, sales } = await setup();
    const id = await seedEntry(user.id, cash.id, sales.id, 1000);
    const bob = await prisma.user.create({
      data: { email: "bob@example.com", passwordHash: "hash" },
    });

    const result = await deleteJournalEntry(bob.id, id);

    expect(result.ok).toBe(false);
    // alice の仕訳は残る。
    expect(await prisma.journalEntry.count()).toBe(1);
    expect(await prisma.journalLine.count()).toBe(2);
  });

  test("存在しない ID は { ok: false }", async () => {
    const { user } = await setup();
    expect(await deleteJournalEntry(user.id, 9999)).toEqual({ ok: false });
  });
});
