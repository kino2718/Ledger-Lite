import { describe, expect, test, vi } from "vitest";

// queries.ts は "server-only" を読み込む（クライアントへのバンドル防止）。
// テスト環境では例外になるため空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  getBalanceLines,
  getFirstEntryDate,
  getJournalEntries,
  getJournalEntry,
  getLedgerAccount,
  getLedgerLines,
  getLedgerSection,
  getOpeningBalance,
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

  test("period で取引日の範囲に絞る（年フィルタ）", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2025-12-31", "前年の取引", [
      { accountId: cash.id, side: "debit", amount: 1000 },
      { accountId: sales.id, side: "credit", amount: 1000 },
    ]);
    await createEntry(alice.id, "2026-01-01", "当年最初の取引", [
      { accountId: cash.id, side: "debit", amount: 2000 },
      { accountId: sales.id, side: "credit", amount: 2000 },
    ]);
    await createEntry(alice.id, "2026-12-31", "当年最後の取引", [
      { accountId: cash.id, side: "debit", amount: 3000 },
      { accountId: sales.id, side: "credit", amount: 3000 },
    ]);
    await createEntry(alice.id, "2027-01-01", "翌年の取引", [
      { accountId: cash.id, side: "debit", amount: 4000 },
      { accountId: sales.id, side: "credit", amount: 4000 },
    ]);

    const entries = await getJournalEntries(alice.id, {
      from: "2026-01-01",
      to: "2026-12-31",
    });

    // 境界（1/1・12/31）は含み、前年・翌年は含まない。新しい順のまま。
    expect(entries.map((e) => e.description)).toEqual([
      "当年最後の取引",
      "当年最初の取引",
    ]);
  });
});

// --- getFirstEntryDate（年セレクタの範囲） -------------------------------------

describe("getFirstEntryDate", () => {
  test("一番古い仕訳の取引日を返す", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2026-06-18", "新しい取引", [
      { accountId: cash.id, side: "debit", amount: 1000 },
      { accountId: sales.id, side: "credit", amount: 1000 },
    ]);
    await createEntry(alice.id, "2024-03-15", "一番古い取引", [
      { accountId: cash.id, side: "debit", amount: 2000 },
      { accountId: sales.id, side: "credit", amount: 2000 },
    ]);

    expect(await getFirstEntryDate(alice.id)).toBe("2024-03-15");
  });

  test("仕訳が無ければ null を返す", async () => {
    const alice = await createUser("alice@example.com");

    expect(await getFirstEntryDate(alice.id)).toBeNull();
  });

  test("他ユーザーの仕訳は見ない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(bob.id, "2020-01-01", "bob の古い取引", [
      { accountId: bobCash.id, side: "debit", amount: 1000 },
      { accountId: bobSales.id, side: "credit", amount: 1000 },
    ]);

    expect(await getFirstEntryDate(alice.id)).toBeNull();
  });
});

// --- getOpeningBalance（前期繰越） ---------------------------------------------

describe("getOpeningBalance", () => {
  test("指定日より前の明細を通常残高方向で合計する（当日は含まない）", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    // 前年: 収入 30,000 − 支出 8,000 ＝ 現金 22,000。
    await createEntry(alice.id, "2025-06-10", "前年の売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(alice.id, "2025-12-31", "前年の支払", [
      { accountId: sales.id, side: "debit", amount: 8000 },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);
    // 当日（年初）以降の明細は含まれない。
    await createEntry(alice.id, "2026-01-01", "当年の売上", [
      { accountId: cash.id, side: "debit", amount: 5000 },
      { accountId: sales.id, side: "credit", amount: 5000 },
    ]);

    const balance = await getOpeningBalance({
      userId: alice.id,
      accountId: cash.id,
      normalSide: "debit",
      before: "2026-01-01",
    });

    expect(balance).toBe(22000);
  });

  test("貸方科目は貸方が正になる", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const loan = await createAccount(alice.id, "200", "借入金", "liability");
    await createEntry(alice.id, "2025-04-01", "借入", [
      { accountId: cash.id, side: "debit", amount: 100000 },
      { accountId: loan.id, side: "credit", amount: 100000 },
    ]);
    await createEntry(alice.id, "2025-10-01", "一部返済", [
      { accountId: loan.id, side: "debit", amount: 30000 },
      { accountId: cash.id, side: "credit", amount: 30000 },
    ]);

    const balance = await getOpeningBalance({
      userId: alice.id,
      accountId: loan.id,
      normalSide: "credit",
      before: "2026-01-01",
    });

    expect(balance).toBe(70000);
  });

  test("subAccountId を渡すとその補助科目の明細だけを合計する", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const shopA = await prisma.subAccount.create({
      data: { accountId: sales.id, name: "A店" },
    });
    await createEntry(alice.id, "2025-06-10", "A店の売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      {
        accountId: sales.id,
        subAccountId: shopA.id,
        side: "credit",
        amount: 30000,
      },
    ]);
    await createEntry(alice.id, "2025-06-11", "補助科目なしの売上", [
      { accountId: cash.id, side: "debit", amount: 10000 },
      { accountId: sales.id, side: "credit", amount: 10000 },
    ]);

    const balance = await getOpeningBalance({
      userId: alice.id,
      accountId: sales.id,
      normalSide: "credit",
      before: "2026-01-01",
      subAccountId: shopA.id,
    });

    expect(balance).toBe(30000);
  });

  test("明細が無ければ 0、他ユーザーの明細は見ない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const aliceCash = await createAccount(alice.id, "100", "現金", "asset");
    const bobCash = await createAccount(bob.id, "100", "現金", "asset");
    const bobSales = await createAccount(bob.id, "400", "売上高", "revenue");
    await createEntry(bob.id, "2025-06-10", "bob の売上", [
      { accountId: bobCash.id, side: "debit", amount: 99999 },
      { accountId: bobSales.id, side: "credit", amount: 99999 },
    ]);

    expect(
      await getOpeningBalance({
        userId: alice.id,
        accountId: aliceCash.id,
        normalSide: "debit",
        before: "2026-01-01",
      }),
    ).toBe(0);
    // bob の科目 ID を指定しても、userId が alice なら 0 のまま。
    expect(
      await getOpeningBalance({
        userId: alice.id,
        accountId: bobCash.id,
        normalSide: "debit",
        before: "2026-01-01",
      }),
    ).toBe(0);
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
      // 補助科目を使っていない行の補助科目名は null。
      subAccountName: null,
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

    // 絞り込まずに科目全体を見たときも、各行に自分の補助科目名が付く
    // （印刷用の元帳が摘要欄に添えるのに使う）。
    const all = await getLedgerLines(alice.id, utility.id);
    expect(all.map((l) => l.subAccountName)).toEqual(["電気", "水道"]);
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

// --- getLedgerSection（元帳の組み立て。個別元帳と印刷用元帳で共用） -------------

describe("getLedgerSection", () => {
  // 前年に現金 22,000（30,000 − 8,000）、当年に 5,000 の入金がある共通データ。
  async function setup() {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2025-06-10", "前年の売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(alice.id, "2025-12-31", "前年の値引", [
      { accountId: sales.id, side: "debit", amount: 8000 },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);
    await createEntry(alice.id, "2026-02-01", "当年の売上", [
      { accountId: cash.id, side: "debit", amount: 5000 },
      { accountId: sales.id, side: "credit", amount: 5000 },
    ]);
    return { alice, cash, sales };
  }

  test("年で絞ると前期繰越から当年の明細だけを積み上げる", async () => {
    const { alice, cash } = await setup();

    const section = await getLedgerSection({
      userId: alice.id,
      account: { id: cash.id, accountType: "asset", normalSide: "debit" },
      selection: 2026,
    });

    expect(section.openingBalance).toBe(22000);
    expect(section.showOpeningRow).toBe(true);
    expect(section.rows.map((r) => r.description)).toEqual(["当年の売上"]);
    // 残高は前期繰越 22,000 に当年分を足したところから始まる。
    expect(section.rows[0].balance).toBe(27000);
    expect(section.closingBalance).toBe(27000);
  });

  test("全期間なら前期繰越を持たず、全明細を積み上げる", async () => {
    const { alice, cash } = await setup();

    const section = await getLedgerSection({
      userId: alice.id,
      account: { id: cash.id, accountType: "asset", normalSide: "debit" },
      selection: "all",
    });

    expect(section.openingBalance).toBe(0);
    expect(section.showOpeningRow).toBe(false);
    expect(section.rows.map((r) => r.description)).toEqual([
      "前年の売上",
      "前年の値引",
      "当年の売上",
    ]);
    expect(section.closingBalance).toBe(27000);
  });

  test("収益・費用は年で絞っても前期繰越を持たない（毎年ゼロから）", async () => {
    const { alice, sales } = await setup();

    const section = await getLedgerSection({
      userId: alice.id,
      account: { id: sales.id, accountType: "revenue", normalSide: "credit" },
      selection: 2026,
    });

    expect(section.openingBalance).toBe(0);
    expect(section.showOpeningRow).toBe(false);
    expect(section.rows.map((r) => r.description)).toEqual(["当年の売上"]);
    expect(section.closingBalance).toBe(5000);
  });

  test("aggStart（前年を締めた年）では前期繰越行を出さない", async () => {
    const { alice, cash } = await setup();

    // 前年を締めると集計開始＝年初になり、年初より前は合計されない。
    // 実際には 1/1 付の繰越仕訳が明細行として残高を供給する。
    const section = await getLedgerSection({
      userId: alice.id,
      account: { id: cash.id, accountType: "asset", normalSide: "debit" },
      selection: 2026,
      aggStart: "2026-01-01",
    });

    expect(section.openingBalance).toBe(0);
    expect(section.showOpeningRow).toBe(false);
    expect(section.rows.map((r) => r.description)).toEqual(["当年の売上"]);
  });

  test("subAccountId を渡すと前期繰越も明細もその補助科目分だけになる", async () => {
    const alice = await createUser("alice@example.com");
    const bank = await createAccount(alice.id, "110", "普通預金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const bankA = await prisma.subAccount.create({
      data: { accountId: bank.id, name: "A銀行" },
    });
    const bankB = await prisma.subAccount.create({
      data: { accountId: bank.id, name: "B銀行" },
    });
    const deposit = (sub: number, amount: number) => [
      { accountId: bank.id, subAccountId: sub, side: "debit" as const, amount },
      { accountId: sales.id, side: "credit" as const, amount },
    ];
    await createEntry(alice.id, "2025-03-01", "前年入金A", deposit(bankA.id, 10000));
    await createEntry(alice.id, "2025-04-01", "前年入金B", deposit(bankB.id, 20000));
    await createEntry(alice.id, "2026-02-01", "当年入金A", deposit(bankA.id, 3000));
    await createEntry(alice.id, "2026-03-01", "当年入金B", deposit(bankB.id, 4000));

    const section = await getLedgerSection({
      userId: alice.id,
      account: { id: bank.id, accountType: "asset", normalSide: "debit" },
      selection: 2026,
      subAccountId: bankA.id,
    });

    expect(section.openingBalance).toBe(10000);
    expect(section.showOpeningRow).toBe(true);
    expect(section.rows.map((r) => r.description)).toEqual(["当年入金A"]);
    expect(section.closingBalance).toBe(13000);
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
