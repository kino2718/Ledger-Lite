import { describe, expect, test, vi } from "vitest";

// queries.ts は "server-only" を読み込む（クライアントへのバンドル防止）。
// テスト環境では例外になるため空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  getBalanceLines,
  getLedgerAccount,
  getLedgerLines,
} from "@/lib/journal/queries";
import { buildLedgerRows } from "@/lib/ledger/ledger";
import { computeTrialBalance, normalBalanceSide } from "@/lib/ledger/balance";
import type { AccountType, Side } from "@/lib/ledger/types";

// このファイルは「クエリ → 純粋関数」の合成（＝各ページが実際に行う処理）を
// 実 DB で通しで確認する。部品単体（queries.test / balance.test / ledger.test）
// では拾えない、繋ぎ目のバグや符号の退行を防ぐのが狙い。

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

// --- 1. 事業主貸の符号（回帰テスト） -------------------------------------------

describe("元帳の合成：評価勘定（事業主貸）の符号", () => {
  test("借方計上の事業主貸は残高が正に積み上がる", async () => {
    const alice = await createUser("alice@example.com");
    // 事業主貸は純資産だが通常残高は借方（normalSide=debit）。
    const drawings = await createAccount(
      alice.id,
      "300",
      "事業主貸",
      "equity",
      "debit",
    );
    const bank = await createAccount(alice.id, "101", "普通預金", "asset");
    // カード代の支払い：借方 事業主貸 / 貸方 普通預金 を 2 回。
    await createEntry(alice.id, "2026-06-10", "カード代", [
      { accountId: drawings.id, side: "debit", amount: 10000 },
      { accountId: bank.id, side: "credit", amount: 10000 },
    ]);
    await createEntry(alice.id, "2026-06-20", "カード代", [
      { accountId: drawings.id, side: "debit", amount: 3000 },
      { accountId: bank.id, side: "credit", amount: 3000 },
    ]);

    // ページと同じ流れ：科目の normalSide を元帳の積み上げに渡す。
    const account = await getLedgerAccount(alice.id, drawings.id);
    expect(account?.normalSide).toBe("debit");
    const lines = await getLedgerLines(alice.id, drawings.id);
    const rows = buildLedgerRows({
      lines,
      normalSide: account!.normalSide,
    });

    // 借方で正に積み上がる（マイナスにならない）。相手科目は普通預金。
    expect(rows.map((r) => r.balance)).toEqual([10000, 13000]);
    expect(rows[0]).toMatchObject({
      debit: 10000,
      credit: 0,
      counterLabel: "普通預金",
    });
  });
});

// --- 2. 試算表の合成＋貸借一致 -------------------------------------------------

describe("試算表の合成：getBalanceLines → computeTrialBalance", () => {
  test("釣り合った仕訳から作った試算表は借方と貸方が一致する", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const bank = await createAccount(alice.id, "101", "普通預金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const utility = await createAccount(alice.id, "501", "水道光熱費", "expense");
    await createEntry(alice.id, "2026-06-10", "現金売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(alice.id, "2026-06-20", "電気料金", [
      { accountId: utility.id, side: "debit", amount: 8000 },
      { accountId: bank.id, side: "credit", amount: 8000 },
    ]);

    const tb = computeTrialBalance(await getBalanceLines(alice.id));

    // 貸借平均：合計・残高とも借方＝貸方。
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.totalDebitBalance).toBe(tb.totalCreditBalance);
    expect(tb.totalDebit).toBe(38000);

    // 科目ごとの中身（順序に依存せず accountId で引く）。
    const byId = new Map(tb.rows.map((r) => [r.accountId, r]));
    expect(byId.get(cash.id)).toMatchObject({
      debit: 30000,
      credit: 0,
      debitBalance: 30000,
      creditBalance: 0,
    });
    expect(byId.get(sales.id)).toMatchObject({
      credit: 30000,
      creditBalance: 30000,
    });
    expect(byId.get(bank.id)).toMatchObject({
      credit: 8000,
      creditBalance: 8000,
    });
  });
});

// --- 3. 元帳の合成（残高・相手科目・並び順） -----------------------------------

describe("元帳の合成：getLedgerLines → buildLedgerRows", () => {
  test("複数仕訳を取引日順に積み上げ、相手科目（単一／諸口）も出る", async () => {
    const alice = await createUser("alice@example.com");
    const cash = await createAccount(alice.id, "100", "現金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    const misc = await createAccount(alice.id, "402", "雑収入", "revenue");
    const utility = await createAccount(alice.id, "501", "水道光熱費", "expense");
    // 日付が前後する順で登録し、並べ替えを確認する。
    await createEntry(alice.id, "2026-06-20", "電気料金", [
      { accountId: utility.id, side: "debit", amount: 8000 },
      { accountId: cash.id, side: "credit", amount: 8000 },
    ]);
    await createEntry(alice.id, "2026-06-10", "現金売上", [
      { accountId: cash.id, side: "debit", amount: 30000 },
      { accountId: sales.id, side: "credit", amount: 30000 },
    ]);
    await createEntry(alice.id, "2026-06-15", "売上と雑収入", [
      { accountId: cash.id, side: "debit", amount: 12000 },
      { accountId: sales.id, side: "credit", amount: 10000 },
      { accountId: misc.id, side: "credit", amount: 2000 },
    ]);

    const account = await getLedgerAccount(alice.id, cash.id);
    const lines = await getLedgerLines(alice.id, cash.id);
    const rows = buildLedgerRows({ lines, normalSide: account!.normalSide });

    // 取引日の昇順。残高は借方で増え、貸方で減る。
    expect(rows.map((r) => r.entryDate)).toEqual([
      "2026-06-10",
      "2026-06-15",
      "2026-06-20",
    ]);
    expect(rows.map((r) => r.balance)).toEqual([30000, 42000, 34000]);
    // 相手科目：単一科目はその名、複数は諸口。
    expect(rows.map((r) => r.counterLabel)).toEqual([
      "売上高",
      "諸口",
      "水道光熱費",
    ]);
    // 借方・貸方の列。
    expect(rows[0]).toMatchObject({ debit: 30000, credit: 0 });
    expect(rows[2]).toMatchObject({ debit: 0, credit: 8000 });
  });
});
