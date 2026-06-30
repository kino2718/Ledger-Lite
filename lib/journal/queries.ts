// ホーム画面（ダッシュボード）向けのデータ取得。
// すべて userId でスコープし、他ユーザーのデータは返さない。
// 集計そのものは lib/ledger の純粋関数に任せ、ここは「DBから取って形を整える」だけ。
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AccountType, BalanceLine, Side } from "@/lib/ledger/types";
import type { LedgerSourceLine } from "@/lib/ledger/ledger";

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
      account: { select: { accountType: true, normalSide: true } },
    },
  });

  return lines.map((line) => ({
    accountId: line.accountId,
    accountType: line.account.accountType,
    normalSide: line.account.normalSide,
    side: line.side,
    amount: line.amount,
  }));
}

// 元帳の見出し・補助元帳の絞り込み用に、科目 1 件とその補助科目を表す。
export type LedgerAccount = {
  id: number;
  code: string | null;
  name: string;
  accountType: AccountType;
  normalSide: Side;
  // 補助元帳の絞り込みチップ用。過去の明細を辿れるよう無効な補助科目も含める。
  subAccounts: { id: number; name: string }[];
};

/**
 * 元帳の対象となる科目を 1 件、補助科目つきで取得する。所有者でなければ null。
 * normalSide は残高の積み上げ方向（buildLedgerRows）に使う。
 */
export async function getLedgerAccount(
  userId: number,
  accountId: number,
): Promise<LedgerAccount | null> {
  return prisma.account.findFirst({
    // id だけでなく userId も条件にして所有スコープを担保する。
    where: { id: accountId, userId },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      normalSide: true,
      subAccounts: {
        orderBy: { id: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

/**
 * 総勘定元帳・補助元帳用に、ある科目（必要なら補助科目）の明細を取引日順で取得する。
 * 1 明細＝元帳の 1 行。相手科目を出せるよう、同じ仕訳の「対象科目以外の明細」を
 * siblings として添える。subAccountId を渡すとその補助科目の明細だけに絞る（補助元帳）。
 * 返り値は buildLedgerRows（lib/ledger/ledger.ts）にそのまま渡せる形。
 */
// この入れ子の select は「ほしい結果の形」を宣言しているだけで、Prisma は
// 1 階層 = 1 クエリの平らな SQL（合計 4 本）に分けて実行し、ID で突き合わせて
// 束ね直す。各階層は accountId / entryId の索引に乗るので N+1 にはならない。
// 実際に発行される SQL（読みやすく整理。IN(...) には前段の結果 ID が入る）：
//
//   -- 1) 元帳の各行となる、対象科目の明細を取る
//   SELECT id, entryId, side, amount
//   FROM JournalLine
//   JOIN JournalEntry j0 ON j0.id = JournalLine.entryId   -- where の entry:{...} 用
//   WHERE JournalLine.accountId = ?                        -- 対象科目
//     AND j0.userId = ? AND j0.entryDate >= ? AND j0.entryDate <= ?
//   ORDER BY j0.entryDate, JournalLine.entryId, JournalLine.lineNo;
//
//   -- 2) その明細たちの親の仕訳をまとめて取る（entryDate / description）
//   SELECT id, entryDate, description
//   FROM JournalEntry WHERE id IN (1 の entryId たち);
//
//   -- 3) 同じ仕訳の対象科目以外の明細＝相手科目をまとめて取る
//   SELECT id, accountId, entryId
//   FROM JournalLine
//   WHERE accountId <> ? AND entryId IN (1 の entryId たち)
//   ORDER BY lineNo;
//
//   -- 4) 3 で出た科目の名前をまとめて取る
//   SELECT id, name FROM Account WHERE id IN (3 の accountId たち);
export async function getLedgerLines(
  userId: number,
  accountId: number,
  subAccountId?: number,
  period?: DateRange,
): Promise<LedgerSourceLine[]> {
  const lines = await prisma.journalLine.findMany({
    // ── 1) 元帳の各行となる、対象科目の明細を選ぶ ──
    where: {
      accountId,
      // 補助科目の指定があるときだけ絞る（未指定なら全補助科目を含む）。
      ...(subAccountId !== undefined ? { subAccountId } : {}),
      entry: {
        userId,
        entryDate: {
          ...(period?.from ? { gte: period.from } : {}),
          ...(period?.to ? { lte: period.to } : {}),
        },
      },
    },
    // 取引日の昇順。同日内は仕訳・行の登録順で安定させる（残高の積み上げ順）。
    orderBy: [
      { entry: { entryDate: "asc" } },
      { entryId: "asc" },
      { lineNo: "asc" },
    ],
    select: {
      entryId: true,
      side: true,
      amount: true,
      // ── 2) 各明細の親の仕訳から日付・摘要を引く ──
      entry: {
        select: {
          entryDate: true,
          description: true,
          // ── 3) 相手科目の判定用に、同じ仕訳の対象科目以外の明細を集める ──
          lines: {
            where: { accountId: { not: accountId } },
            orderBy: { lineNo: "asc" },
            select: {
              accountId: true,
              // ── 4) 相手科目の名前を引く ──
              account: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return lines.map((line) => ({
    entryId: line.entryId,
    entryDate: line.entry.entryDate,
    description: line.entry.description,
    side: line.side,
    amount: line.amount,
    siblings: line.entry.lines.map((sibling) => ({
      accountId: sibling.accountId,
      accountName: sibling.account.name,
    })),
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
