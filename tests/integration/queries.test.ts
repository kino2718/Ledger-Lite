import { describe, expect, test, vi } from "vitest";

// queries.ts は "server-only" を読み込む（クライアントへのバンドル防止）。
// テスト環境では例外になるため空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  getBalanceLines,
  getJournalEntries,
  getJournalEntry,
  getLedgerAccount,
  getLedgerLines,
  getRecentJournalEntries,
} from "@/lib/journal/queries";
import { normalBalanceSide } from "@/lib/ledger/balance";
import type { AccountType, Side } from "@/lib/ledger/types";

// --- テスト用のデータ作成ヘルパー --------------------------------------------

function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "hash" } });
}

function createAccount(
  userId: number,
  code: string,
  name: string,
  accountType: AccountType,
  // 未指定なら分類の既定の向き。評価勘定のテストでは明示的に上書きする。
  normalSide: Side = normalBalanceSide(accountType),
) {
  return prisma.account.create({
    data: { userId, code, name, accountType, normalSide },
  });
}

function createEntry(
  userId: number,
  entryDate: string,
  description: string | null,
  lines: {
    accountId: number;
    subAccountId?: number | null;
    side: Side;
    amount: number;
  }[],
) {
  return prisma.journalEntry.create({
    data: {
      userId,
      entryDate,
      description,
      lines: {
        create: lines.map((line, i) => ({ lineNo: i + 1, ...line })),
      },
    },
  });
}

// --- getBalanceLines ---------------------------------------------------------

describe("getBalanceLines", () => {
  test("ユーザーの仕訳明細を BalanceLine の形（科目分類付き）で返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-18", "現金売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);

    const lines = await getBalanceLines(alice.id);

    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual({
      accountId: cash.id,
      accountType: "asset",
      normalSide: "debit",
      side: "debit",
      amount: 30000,
    });
    expect(lines).toContainEqual({
      accountId: sales.id,
      accountType: "revenue",
      normalSide: "credit",
      side: "credit",
      amount: 30000,
    });
  });

  test("period で取引日の範囲に絞る", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-05-31", "5月の売上", [
      { accountId: cash.id, side: "debit", amount: 10000 },
      { accountId: sales.id, side: "credit", amount: 10000 },
    ]);
    await createEntry(alice.id, "2026-06-15", "6月の売上", [
      { accountId: cash.id, side: "debit", amount: 20000 },
      { accountId: sales.id, side: "credit", amount: 20000 },
    ]);

    const june = await getBalanceLines(alice.id, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(june).toHaveLength(2);
    expect(june.every((l) => l.amount === 20000)).toBe(true);
  });

  test("他ユーザーの明細は含めない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const aliceCash = await createAccount(alice.id, "100", "現金", "asset");
    const aliceSales = await createAccount(alice.id, "400", "売上高", "revenue");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-18", "alice の売上", [
      { accountId: aliceCash.id, side: "debit", amount: 30000 },
      { accountId: aliceSales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(bob.id, "2026-06-18", "bob の売上", [
      { accountId: bobCash.id, side: "debit", amount: 99999 },
      { accountId: bobSales.id, side: "credit", amount: 99999 },
    ]);

    const lines = await getBalanceLines(alice.id);

    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.amount === 99999)).toBe(false);
  });
});

// --- getRecentJournalEntries -------------------------------------------------

describe("getRecentJournalEntries", () => {
  test("取引日の新しい順に、借方合計を total として返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-01", "古い取引", [
      { accountId: cash.id, side: "debit", amount: 1000 },
      { accountId: sales.id, side: "credit", amount: 1000 },
    ]);
    await createEntry(alice.id, "2026-06-18", "新しい取引", [
      { accountId: cash.id, side: "debit", amount: 5000 },
      { accountId: sales.id, side: "credit", amount: 5000 },
    ]);

    const recent = await getRecentJournalEntries(alice.id);

    expect(recent.map((e) => e.description)).toEqual([
      "新しい取引",
      "古い取引",
    ]);
    expect(recent[0].total).toBe(5000);
  });

  test("limit で件数を制限する", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    for (let day = 1; day <= 3; day++) {
      const date = `2026-06-0${day}`;
      await createEntry(alice.id, date, `取引${day}`, [
        { accountId: cash.id, side: "debit", amount: 1000 },
        { accountId: sales.id, side: "credit", amount: 1000 },
      ]);
    }

    const recent = await getRecentJournalEntries(alice.id, 2);

    expect(recent).toHaveLength(2);
    expect(recent.map((e) => e.description)).toEqual(["取引3", "取引2"]);
  });

  test("description が未設定なら null を返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-18", null, [
      { accountId: cash.id, side: "debit", amount: 1000 },
      { accountId: sales.id, side: "credit", amount: 1000 },
    ]);

    const recent = await getRecentJournalEntries(alice.id);

    expect(recent[0].description).toBeNull();
  });

  test("他ユーザーの仕訳は含めない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(bob.id, "2026-06-18", "bob の取引", [
      { accountId: bobCash.id, side: "debit", amount: 1000 },
      { accountId: bobSales.id, side: "credit", amount: 1000 },
    ]);

    const recent = await getRecentJournalEntries(alice.id);

    expect(recent).toEqual([]);
  });
});

// --- getJournalEntries（一覧） -------------------------------------------------

describe("getJournalEntries", () => {
  test("全件を取引日の新しい順に、借方合計を total として返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-01", "古い取引", [
      { accountId: cash.id, side: "debit", amount: 1000 },
      { accountId: sales.id, side: "credit", amount: 1000 },
    ]);
    await createEntry(alice.id, "2026-06-18", "新しい取引", [
      { accountId: cash.id, side: "debit", amount: 5000 },
      { accountId: sales.id, side: "credit", amount: 5000 },
    ]);

    const entries = await getJournalEntries(alice.id);

    // 件数制限なしで全件。新しい順。
    expect(entries.map((e) => e.description)).toEqual([
      "新しい取引",
      "古い取引",
    ]);
    expect(entries[0].total).toBe(5000);
  });

  test("各仕訳の明細を科目名・補助科目名つきで lineNo 順に含める", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const utility = await createAccount(alice.id, "401", "水道光熱費", "expense");
    const electric = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "電気" },
    });
    await createEntry(alice.id, "2026-06-12", "電気料金", [
      {
        accountId: utility.id,
        subAccountId: electric.id,
        side: "debit",
        amount: 8000,
      },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);

    const [entry] = await getJournalEntries(alice.id);

    expect(entry.lines).toEqual([
      {
        side: "debit",
        amount: 8000,
        accountName: "水道光熱費",
        subAccountName: "電気",
      },
      {
        side: "credit",
        amount: 8000,
        accountName: "現金",
        subAccountName: null,
      },
    ]);
  });

  test("他ユーザーの仕訳は含めない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(bob.id, "2026-06-18", "bob の取引", [
      { accountId: bobCash.id, side: "debit", amount: 1000 },
      { accountId: bobSales.id, side: "credit", amount: 1000 },
    ]);

    expect(await getJournalEntries(alice.id)).toEqual([]);
  });
});

// --- getLedgerLines（元帳） ----------------------------------------------------

describe("getLedgerLines", () => {
  test("対象科目の明細だけを取引日順に、相手科目つきで返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const utility = await createAccount(alice.id, "401", "水道光熱費", "expense");
    // 現金が登場する仕訳を 2 件（日付の逆順で登録して並べ替えを確認）。
    await createEntry(alice.id, "2026-06-20", "電気料金", [
      { accountId: utility.id, side: "debit", amount: 8000 },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);
    await createEntry(alice.id, "2026-06-10", "現金売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);

    const lines = await getLedgerLines(alice.id, cash.id);

    expect(lines).toHaveLength(2);
    // 取引日の昇順。
    expect(lines.map((l) => l.entryDate)).toEqual(["2026-06-10", "2026-06-20"]);
    expect(lines[0]).toMatchObject({
      entryDate: "2026-06-10",
      description: "現金売上",
      side: "debit",
      amount: 30000,
      siblings: [{ accountId: sales.id, accountName: "売上高" }],
    });
    expect(lines[1]).toMatchObject({
      side: "credit",
      amount: 8000,
      siblings: [{ accountId: utility.id, accountName: "水道光熱費" }],
    });
  });

  test("複数の相手科目は siblings に並ぶ（諸口の元になる）", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const misc = await createAccount(alice.id, "402", "雑収入", "revenue");
    await createEntry(alice.id, "2026-06-15", "売上と雑収入", [
      { accountId: cash.id, side: "debit", amount: 12000 },
      { accountId: sales.id, side: "credit", amount: 10000 },
      { accountId: misc.id, side: "credit", amount: 2000 },
    ]);

    const [line] = await getLedgerLines(alice.id, cash.id);

    expect(line.siblings).toEqual([
      { accountId: sales.id, accountName: "売上高" },
      { accountId: misc.id, accountName: "雑収入" },
    ]);
  });

  test("subAccountId を渡すとその補助科目の明細だけに絞る（補助元帳）", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const utility = await createAccount(alice.id, "401", "水道光熱費", "expense");
    const electric = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "電気" },
    });
    const water = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "水道" },
    });
    await createEntry(alice.id, "2026-06-12", "電気料金", [
      { accountId: utility.id, subAccountId: electric.id, side: "debit", amount: 8000 },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);
    await createEntry(alice.id, "2026-06-13", "水道料金", [
      { accountId: utility.id, subAccountId: water.id, side: "debit", amount: 3000 },
      { accountId: cash.id, side: "credit", amount: 3000 },
    ]);

    const electricOnly = await getLedgerLines(alice.id, utility.id, electric.id);

    expect(electricOnly).toHaveLength(1);
    expect(electricOnly[0]).toMatchObject({
      description: "電気料金",
      amount: 8000,
      siblings: [{ accountId: cash.id, accountName: "現金" }],
    });
  });

  test("他ユーザーの明細は含めない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const aliceCash = await createAccount(alice.id, "100", "現金", "asset");
    const aliceSales = await createAccount(alice.id, "400", "売上高", "revenue");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-18", "alice の売上", [
      { accountId: aliceCash.id, side: "debit", amount: 30000 },
      { accountId: aliceSales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(bob.id, "2026-06-18", "bob の売上", [
      { accountId: bobCash.id, side: "debit", amount: 99999 },
      { accountId: bobSales.id, side: "credit", amount: 99999 },
    ]);

    const lines = await getLedgerLines(alice.id, aliceCash.id);

    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(30000);
  });

  test("period で取引日の範囲に絞る", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-05-31", "5月の売上", [
      { accountId: cash.id, side: "debit", amount: 10000 },
      { accountId: sales.id, side: "credit", amount: 10000 },
    ]);
    await createEntry(alice.id, "2026-06-15", "6月の売上", [
      { accountId: cash.id, side: "debit", amount: 20000 },
      { accountId: sales.id, side: "credit", amount: 20000 },
    ]);

    const june = await getLedgerLines(alice.id, cash.id, undefined, {
      from: "2026-06-01",
      to: "2026-06-30",
    });

    expect(june).toHaveLength(1);
    expect(june[0].amount).toBe(20000);
  });
});

// --- getLedgerAccount（元帳の対象科目） ----------------------------------------

describe("getLedgerAccount", () => {
  test("科目を補助科目つきで返す", async () => {
    const alice = await createUser("alice@example.com");
    const utility = await createAccount(alice.id, "401", "水道光熱費", "expense");
    const electric = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "電気" },
    });
    const water = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "水道" },
    });

    const result = await getLedgerAccount(alice.id, utility.id);

    expect(result).toEqual({
      id: utility.id,
      code: "401",
      name: "水道光熱費",
      accountType: "expense",
      normalSide: "debit",
      subAccounts: [
        { id: electric.id, name: "電気" },
        { id: water.id, name: "水道" },
      ],
    });
  });

  test("評価勘定は保存された normalSide を返す（equity でも debit）", async () => {
    const alice = await createUser("alice@example.com");
    // 事業主貸：純資産だが通常残高は借方。
    const drawings = await createAccount(
      alice.id,
      "300",
      "事業主貸",
      "equity",
      "debit",
    );

    const result = await getLedgerAccount(alice.id, drawings.id);

    expect(result).toMatchObject({ accountType: "equity", normalSide: "debit" });
  });

  test("他ユーザーの科目は取得できない（null）", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");

    expect(await getLedgerAccount(alice.id, bobCash.id)).toBeNull();
  });
});

// --- getJournalEntry（詳細） ---------------------------------------------------

describe("getJournalEntry", () => {
  test("明細を lineNo 昇順で含めて 1 件返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const utility = await createAccount(alice.id, "401", "水道光熱費", "expense");
    const electric = await prisma.subAccount.create({
      data: { accountId: utility.id, name: "電気" },
    });
    const entry = await createEntry(alice.id, "2026-06-12", "電気料金", [
      {
        accountId: utility.id,
        subAccountId: electric.id,
        side: "debit",
        amount: 8000,
      },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);

    const result = await getJournalEntry(alice.id, entry.id);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      id: entry.id,
      entryDate: "2026-06-12",
      description: "電気料金",
      lines: [
        {
          accountId: utility.id,
          subAccountId: electric.id,
          side: "debit",
          amount: 8000,
        },
        { accountId: cash.id, subAccountId: null, side: "credit", amount: 8000 },
      ],
    });
  });

  test("他ユーザーの仕訳は取得できない（null）", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    const entry = await createEntry(bob.id, "2026-06-18", "bob の取引", [
      { accountId: bobCash.id, side: "debit", amount: 1000 },
      { accountId: bobSales.id, side: "credit", amount: 1000 },
    ]);

    expect(await getJournalEntry(alice.id, entry.id)).toBeNull();
  });

  test("存在しない ID は null", async () => {
    const alice = await createUser("alice@example.com");
    expect(await getJournalEntry(alice.id, 9999)).toBeNull();
  });
});
