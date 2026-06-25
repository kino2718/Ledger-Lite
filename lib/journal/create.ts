// 仕訳の保存・更新・削除処理（書き込み）。検証を通った場合のみ DB へ反映する。
// 検証ロジックは lib/journal/validation.ts に委ね、ここは「マスタ取得→検証→保存」を束ねる。
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  validateAgainstMasters,
  validateJournalEntry,
} from "./validation";
import type { JournalEntryInput } from "./validation";

export type CreateJournalEntryResult =
  | { ok: true; id: number }
  | { ok: false; errors: string[] };

// 更新も成功時に対象 ID を返すため、作成と同じ形にする。
export type UpdateJournalEntryResult = CreateJournalEntryResult;

export type DeleteJournalEntryResult = { ok: true } | { ok: false };

// 入力単体の検証＋ユーザー所有マスタとの整合検証をまとめて行い、エラーを返す。
// エラーが空なら検証通過。作成・更新で共通に使う。
async function collectValidationErrors(
  userId: number,
  input: JournalEntryInput,
): Promise<string[]> {
  const errors: string[] = [];

  // 1. 入力データだけで判定できる検証。
  const basic = validateJournalEntry(input);
  if (!basic.ok) errors.push(...basic.errors);

  // 2. マスタ整合の検証。所有判定のため、そのユーザーの科目だけを取得して渡す。
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      id: true,
      isActive: true,
      subAccounts: { select: { id: true, isActive: true } },
    },
  });
  const master = validateAgainstMasters(input, accounts);
  if (!master.ok) errors.push(...master.errors);

  // 両検証で同じメッセージが出ても 1 件にまとめる。
  return [...new Set(errors)];
}

// 入力明細を JournalLine の create 用データへ変換する（lineNo は 1 始まり）。
function toLineCreates(input: JournalEntryInput) {
  return input.lines.map((line, index) => ({
    lineNo: index + 1,
    accountId: line.accountId,
    subAccountId: line.subAccountId,
    side: line.side,
    amount: line.amount,
  }));
}

/**
 * 仕訳を検証して保存する。
 * 入力データだけの検証（貸借一致など）と、ユーザー所有のマスタとの整合検証を
 * 両方通った場合のみ、ヘッダーと明細をまとめて保存する（明細の lineNo は 1 始まり）。
 */
export async function createJournalEntry(
  userId: number,
  input: JournalEntryInput,
): Promise<CreateJournalEntryResult> {
  const errors = await collectValidationErrors(userId, input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // ネストした create は Prisma が 1 トランザクションで実行する。
  const entry = await prisma.journalEntry.create({
    data: {
      userId,
      entryDate: input.entryDate,
      description: input.description,
      lines: { create: toLineCreates(input) },
    },
  });

  return { ok: true, id: entry.id };
}

/**
 * 既存の仕訳を検証して更新する。所有者の仕訳でなければエラー。
 * 明細は差分更新せず、いったん全削除してから入力どおりに再作成する
 * （行の増減・並び替えを単純に扱うため）。削除→再作成→ヘッダー更新は
 * 1 トランザクションでまとめ、途中失敗で明細が消えたままにならないようにする。
 */
export async function updateJournalEntry(
  userId: number,
  id: number,
  input: JournalEntryInput,
): Promise<UpdateJournalEntryResult> {
  const errors = await collectValidationErrors(userId, input);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 対象が存在し、かつこのユーザーの所有であることを確認する。
  const existing = await prisma.journalEntry.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, errors: ["対象の仕訳が見つかりません。"] };
  }

  await prisma.$transaction([
    // 既存明細を全削除し、
    prisma.journalLine.deleteMany({ where: { entryId: id } }),
    // ヘッダーを更新しつつ明細を作り直す。
    prisma.journalEntry.update({
      where: { id },
      data: {
        entryDate: input.entryDate,
        description: input.description,
        lines: { create: toLineCreates(input) },
      },
    }),
  ]);

  return { ok: true, id };
}

/**
 * 仕訳を物理削除する。所有者の仕訳だけを対象にし、明細は Cascade で連動削除される。
 * 該当が無ければ（他ユーザーの仕訳や存在しない ID）{ ok: false }。
 */
export async function deleteJournalEntry(
  userId: number,
  id: number,
): Promise<DeleteJournalEntryResult> {
  // where に userId を含めることで所有スコープを担保する。
  // deleteMany は該当 0 件でも例外にならず、消えた件数を返す。
  const result = await prisma.journalEntry.deleteMany({ where: { id, userId } });
  return result.count > 0 ? { ok: true } : { ok: false };
}
