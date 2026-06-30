import { describe, expect, test, vi } from "vitest";

// create.ts は "server-only" を読み込むためテストでは空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { createJournalEntry } from "@/lib/journal/create";
import type { JournalLineInput } from "@/lib/journal/validation";

// テスト用のユーザーと勘定科目を用意する。
async function setup() {
  const user = await prisma.user.create({
    data: { email: "alice@example.com", passwordHash: "hash" },
  });
  const cash = await prisma.account.create({
    data: {
      userId: user.id,
      code: "100",
      name: "現金",
      accountType: "asset",
      normalSide: "debit",
    },
  });
  const sales = await prisma.account.create({
    data: {
      userId: user.id,
      code: "400",
      name: "売上高",
      accountType: "revenue",
      normalSide: "credit",
    },
  });
  const utility = await prisma.account.create({
    data: {
      userId: user.id,
      code: "401",
      name: "水道光熱費",
      accountType: "expense",
      normalSide: "debit",
      subAccounts: { create: [{ name: "電気" }] },
    },
    include: { subAccounts: true },
  });
  return { user, cash, sales, electricSub: utility.subAccounts[0], utility };
}

function entry(
  lines: JournalLineInput[],
  overrides: { entryDate?: string; description?: string | null } = {},
) {
  return {
    entryDate: overrides.entryDate ?? "2026-06-20",
    description: overrides.description ?? "テスト取引",
    lines,
  };
}

describe("createJournalEntry", () => {
  test("正しい仕訳を保存し、明細に 1 始まりの lineNo を振る", async () => {
    const { user, cash, sales } = await setup();

    const result = await createJournalEntry(
      user.id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 1000 },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 1000 },
      ]),
    );

    expect(result.ok).toBe(true);

    const saved = await prisma.journalEntry.findMany({
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].lines.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(saved[0].description).toBe("テスト取引");
  });

  test("補助科目つきの仕訳も保存できる", async () => {
    const { user, cash, utility, electricSub } = await setup();

    const result = await createJournalEntry(
      user.id,
      entry([
        {
          accountId: utility.id,
          subAccountId: electricSub.id,
          side: "debit",
          amount: 8000,
        },
        { accountId: cash.id, subAccountId: null, side: "credit", amount: 8000 },
      ]),
    );

    expect(result.ok).toBe(true);
    const line = await prisma.journalLine.findFirst({
      where: { subAccountId: electricSub.id },
    });
    expect(line?.subAccountId).toBe(electricSub.id);
  });

  test("貸借が一致しないと保存せずエラーを返す", async () => {
    const { user, cash, sales } = await setup();

    const result = await createJournalEntry(
      user.id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 1000 },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 900 },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.journalLine.count()).toBe(0);
  });

  test("他ユーザーの科目を参照すると保存せずエラーを返す", async () => {
    const { user, cash } = await setup();
    const other = await prisma.user.create({
      data: { email: "bob@example.com", passwordHash: "hash" },
    });
    const otherAccount = await prisma.account.create({
      data: {
        userId: other.id,
        code: "400",
        name: "売上高",
        accountType: "revenue",
        normalSide: "credit",
      },
    });

    const result = await createJournalEntry(
      user.id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 1000 },
        {
          accountId: otherAccount.id,
          subAccountId: null,
          side: "credit",
          amount: 1000,
        },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  test("補助科目がその科目に属していないと保存せずエラーを返す", async () => {
    const { user, cash, sales, electricSub } = await setup();

    // 電気（水道光熱費の補助）を、現金の明細に付けるのは整合性違反。
    const result = await createJournalEntry(
      user.id,
      entry([
        {
          accountId: cash.id,
          subAccountId: electricSub.id,
          side: "debit",
          amount: 1000,
        },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 1000 },
      ]),
    );

    expect(result.ok).toBe(false);
    expect(await prisma.journalEntry.count()).toBe(0);
  });

  test("3 行以上でも貸借一致なら保存し、lineNo は順番どおり", async () => {
    const { user, cash, sales } = await setup();

    const result = await createJournalEntry(
      user.id,
      entry([
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 700 },
        { accountId: cash.id, subAccountId: null, side: "debit", amount: 300 },
        { accountId: sales.id, subAccountId: null, side: "credit", amount: 1000 },
      ]),
    );

    expect(result.ok).toBe(true);
    const lines = await prisma.journalLine.findMany({
      orderBy: { lineNo: "asc" },
    });
    expect(lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
  });
});
