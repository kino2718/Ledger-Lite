// 年度締め（YearClosing）まわりのデータ取得。
// すべて userId でスコープし、他ユーザーのデータは返さない。
import "server-only";
import { prisma } from "@/lib/prisma";
import type { DateRange } from "@/lib/ledger/period";
import type { CarryoverSourceLine } from "./carryover";

// 締め済みの年 1 件分。
export type YearClosingSummary = {
  year: number;
  openingEntryId: number;
  createdAt: Date;
};

/** 締め済みの年を新しい順に取得する。 */
export async function getYearClosings(
  userId: number,
): Promise<YearClosingSummary[]> {
  return prisma.yearClosing.findMany({
    where: { userId },
    orderBy: { year: "desc" },
    select: { year: true, openingEntryId: true, createdAt: true },
  });
}

/**
 * 累計残高の集計開始日を返す。
 *
 * 繰越仕訳は「それ以前の全履歴のスナップショット」なので、締めた年より前の
 * 明細まで合算すると二重計上になる。そこで uptoYear より前で最後に締めた年を
 * 探し、その繰越仕訳の日付（締めた年の翌年 1/1）を開始日にする。
 * 締めが無ければ undefined（＝帳簿の最初から集計してよい）。
 *
 * uptoYear を省略すると「現在まで」の集計用（最新の締めを使う）。
 */
export async function getAggregationStart(
  userId: number,
  uptoYear?: number,
): Promise<string | undefined> {
  const latest = await prisma.yearClosing.findFirst({
    where: {
      userId,
      ...(uptoYear !== undefined ? { year: { lt: uptoYear } } : {}),
    },
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return latest ? `${latest.year + 1}-01-01` : undefined;
}

/**
 * 補助科目の名前一覧を取得する（繰越プレビューの表示用）。
 * 無効化済みの補助科目にも残高が残っていることがあるため、有効・無効を問わない。
 */
export async function getSubAccountNames(
  userId: number,
): Promise<{ id: number; name: string }[]> {
  return prisma.subAccount.findMany({
    where: { account: { userId } },
    select: { id: true, name: true },
  });
}

/**
 * 繰越計算用の仕訳明細を取得する。残高集計用（getBalanceLines）とほぼ同じだが、
 * 繰越仕訳で補助科目の内訳を保つため subAccountId も含める。
 */
export async function getCarryoverSourceLines(
  userId: number,
  period: DateRange,
): Promise<CarryoverSourceLine[]> {
  const lines = await prisma.journalLine.findMany({
    where: {
      entry: {
        userId,
        entryDate: {
          ...(period.from ? { gte: period.from } : {}),
          ...(period.to ? { lte: period.to } : {}),
        },
      },
    },
    select: {
      accountId: true,
      subAccountId: true,
      side: true,
      amount: true,
      account: { select: { accountType: true, normalSide: true } },
    },
  });

  return lines.map((line) => ({
    accountId: line.accountId,
    subAccountId: line.subAccountId,
    accountType: line.account.accountType,
    normalSide: line.account.normalSide,
    side: line.side,
    amount: line.amount,
  }));
}
