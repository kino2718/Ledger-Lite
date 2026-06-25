// ホーム画面（ダッシュボード）向けのデータ取得。
// すべて userId でスコープし、他ユーザーのデータは返さない。
// 集計そのものは lib/ledger の純粋関数に任せ、ここは「DBから取って形を整える」だけ。
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AccountType, BalanceLine, Side } from "@/lib/ledger/types";

// 取引日（YYYY-MM-DD 文字列）の範囲指定。辞書順＝日付順なので文字列比較で足りる。
export type DateRange = { from?: string; to?: string };

// 残高表示などで科目名を引くための最小情報。
export type AccountSummary = {
  id: number;
  code: string | null;
  name: string;
  accountType: AccountType;
};

/** ユーザーの勘定科目を科目コード順に取得する。 */
export async function getAccounts(userId: number): Promise<AccountSummary[]> {
  return prisma.account.findMany({
    where: { userId },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, accountType: true },
  });
}

// 仕訳入力フォームの選択肢用。有効な科目と、その有効な補助科目だけを含む。
export type AccountOption = {
  id: number;
  code: string | null;
  name: string;
  accountType: AccountType;
  subAccounts: { id: number; name: string }[];
};

/** 入力フォーム用に、有効な勘定科目（有効な補助科目つき）をコード順で取得する。 */
export async function getAccountOptions(
  userId: number,
): Promise<AccountOption[]> {
  return prisma.account.findMany({
    where: { userId, isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      subAccounts: {
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * 残高・損益の集計用に、ユーザーの仕訳明細を BalanceLine の形で取得する。
 * period を渡すと取引日でその範囲に絞る（損益の月次集計などに使う）。
 */
export async function getBalanceLines(
  userId: number,
  period?: DateRange,
): Promise<BalanceLine[]> {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: {
        userId,
        entryDate: {
          ...(period?.from ? { gte: period.from } : {}),
          ...(period?.to ? { lte: period.to } : {}),
        },
      },
    },
    select: {
      accountId: true,
      side: true,
      amount: true,
      account: { select: { accountType: true } },
    },
  });

  return lines.map((line) => ({
    accountId: line.accountId,
    accountType: line.account.accountType,
    side: line.side,
    amount: line.amount,
  }));
}

// 一覧・最近の仕訳に共通する見出し情報。total は借方合計（＝取引金額）。
export type JournalSummary = {
  id: number;
  entryDate: string;
  description: string | null;
  total: number;
};

// 仕訳帳スタイルの一覧で 1 明細を表示するための情報（科目名つき）。
export type JournalEntryLineView = {
  side: Side;
  amount: number;
  accountName: string;
  subAccountName: string | null;
};

// 一覧の 1 仕訳（見出し＋明細）。
export type JournalEntryRow = JournalSummary & {
  lines: JournalEntryLineView[];
};

// 明細から取引金額（借方合計）を求める。
function debitTotal(lines: { side: Side; amount: number }[]): number {
  return lines
    .filter((line) => line.side === "debit")
    .reduce((sum, line) => sum + line.amount, 0);
}

/**
 * ユーザーの全仕訳を新しい順に、各明細（科目名・補助科目名つき）も含めて取得する。
 * 一覧で借方・貸方の科目まで確認できる（科目の取り違えを見つけやすくする）。
 */
export async function getJournalEntries(
  userId: number,
): Promise<JournalEntryRow[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    // 取引日の降順。同日内は登録の新しい順（id 降順）で安定させる。
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      entryDate: true,
      description: true,
      lines: {
        orderBy: { lineNo: "asc" },
        select: {
          side: true,
          amount: true,
          account: { select: { name: true } },
          subAccount: { select: { name: true } },
        },
      },
    },
  });
  return entries.map((entry) => ({
    id: entry.id,
    entryDate: entry.entryDate,
    description: entry.description,
    total: debitTotal(entry.lines),
    lines: entry.lines.map((line) => ({
      side: line.side,
      amount: line.amount,
      accountName: line.account.name,
      subAccountName: line.subAccount?.name ?? null,
    })),
  }));
}

/** 最近の仕訳を新しい順に取得する（既定で 5 件・明細なしの軽いサマリ）。 */
export async function getRecentJournalEntries(
  userId: number,
  limit = 5,
): Promise<JournalSummary[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      entryDate: true,
      description: true,
      lines: { select: { side: true, amount: true } },
    },
  });
  return entries.map((entry) => ({
    id: entry.id,
    entryDate: entry.entryDate,
    description: entry.description,
    total: debitTotal(entry.lines),
  }));
}

// 編集用：1 件の仕訳（明細つき）。
export type JournalEntryDetail = {
  id: number;
  entryDate: string;
  description: string | null;
  lines: {
    accountId: number;
    subAccountId: number | null;
    side: Side;
    amount: number;
  }[];
};

/** 編集用に 1 件の仕訳を明細つきで取得する。所有者でなければ null。 */
export async function getJournalEntry(
  userId: number,
  id: number,
): Promise<JournalEntryDetail | null> {
  return prisma.journalEntry.findFirst({
    // id だけでなく userId も条件にして所有スコープを担保する。
    where: { id, userId },
    select: {
      id: true,
      entryDate: true,
      description: true,
      lines: {
        orderBy: { lineNo: "asc" },
        select: {
          accountId: true,
          subAccountId: true,
          side: true,
          amount: true,
        },
      },
    },
  });
}
