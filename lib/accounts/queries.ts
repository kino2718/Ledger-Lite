// 科目管理画面向けのデータ取得。
// すべて userId でスコープし、他ユーザーのデータは返さない。
// 仕訳入力フォーム用の getAccountOptions（有効な科目だけ）とは違い、
// 管理画面では無効な科目・補助科目も一覧・編集の対象にする。
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AccountType, Side } from "@/lib/ledger/types";

// 一覧の 1 科目。使用状況（明細数・補助科目数）から「使用中」「削除可」を表示に出す。
export type ManagedAccount = {
  id: number;
  code: string | null;
  name: string;
  accountType: AccountType;
  normalSide: Side;
  isActive: boolean;
  journalLineCount: number;
  subAccountCount: number;
};

/** 科目一覧用に、全科目（無効含む）を使用状況つきでコード順に取得する。 */
export async function getAccountsForManagement(
  userId: number,
): Promise<ManagedAccount[]> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      normalSide: true,
      isActive: true,
      // 行そのものは要らないので件数だけを SQL 側で数えてもらう。
      _count: { select: { journalLines: true, subAccounts: true } },
    },
  });
  return accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    normalSide: account.normalSide,
    isActive: account.isActive,
    journalLineCount: account._count.journalLines,
    subAccountCount: account._count.subAccounts,
  }));
}

// 編集画面の補助科目 1 件。inUse は削除ボタンの表示判定に使う。
export type EditableSubAccount = {
  id: number;
  name: string;
  isActive: boolean;
  inUse: boolean;
};

// 編集画面の科目 1 件。inUse なら分類・通常残高の向きを変更できない。
export type EditableAccount = {
  id: number;
  code: string | null;
  name: string;
  accountType: AccountType;
  normalSide: Side;
  isActive: boolean;
  inUse: boolean;
  subAccounts: EditableSubAccount[];
};

/**
 * 編集用に科目を 1 件、補助科目（無効含む）と使用中フラグつきで取得する。
 * 所有者でなければ null。
 */
export async function getAccountForEdit(
  userId: number,
  accountId: number,
): Promise<EditableAccount | null> {
  const account = await prisma.account.findFirst({
    // id だけでなく userId も条件にして所有スコープを担保する。
    where: { id: accountId, userId },
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      normalSide: true,
      isActive: true,
      _count: { select: { journalLines: true } },
      subAccounts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: { select: { journalLines: true } },
        },
      },
    },
  });
  if (!account) return null;

  return {
    id: account.id,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    normalSide: account.normalSide,
    isActive: account.isActive,
    inUse: account._count.journalLines > 0,
    subAccounts: account.subAccounts.map((sub) => ({
      id: sub.id,
      name: sub.name,
      isActive: sub.isActive,
      inUse: sub._count.journalLines > 0,
    })),
  };
}
