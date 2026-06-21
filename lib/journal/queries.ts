// ホーム画面（ダッシュボード）向けのデータ取得。
// すべて userId でスコープし、他ユーザーのデータは返さない。
// 集計そのものは lib/ledger の純粋関数に任せ、ここは「DBから取って形を整える」だけ。
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AccountType, BalanceLine } from "@/lib/ledger/types";

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

// 最近の仕訳一覧の 1 行分。total は借方合計（＝貸方合計＝取引金額）。
export type RecentEntry = {
  id: number;
  entryDate: string;
  description: string | null;
  total: number;
};

/** 最近の仕訳を新しい順に取得する（既定で 5 件）。 */
export async function getRecentJournalEntries(
  userId: number,
  limit = 5,
): Promise<RecentEntry[]> {
  const entries = await prisma.journalEntry.findMany({
    where: { userId },
    // 取引日の降順。同日内は登録の新しい順（id 降順）で安定させる。
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
    total: entry.lines
      .filter((line) => line.side === "debit")
      .reduce((sum, line) => sum + line.amount, 0),
  }));
}
