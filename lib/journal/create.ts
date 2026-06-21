// 仕訳の保存処理（書き込み）。検証を通った場合のみ DB へ保存する。
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

/**
 * 仕訳を検証して保存する。
 * 入力データだけの検証（貸借一致など）と、ユーザー所有のマスタとの整合検証を
 * 両方通った場合のみ、ヘッダーと明細をまとめて保存する（明細の lineNo は 1 始まり）。
 */
export async function createJournalEntry(
  userId: number,
  input: JournalEntryInput,
): Promise<CreateJournalEntryResult> {
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

  if (errors.length > 0) {
    // 両検証のメッセージが重複しても 1 件にまとめる。
    return { ok: false, errors: [...new Set(errors)] };
  }

  // 3. 保存。ネストした create は Prisma が 1 トランザクションで実行する。
  const entry = await prisma.journalEntry.create({
    data: {
      userId,
      entryDate: input.entryDate,
      description: input.description,
      lines: {
        create: input.lines.map((line, index) => ({
          lineNo: index + 1,
          accountId: line.accountId,
          subAccountId: line.subAccountId,
          side: line.side,
          amount: line.amount,
        })),
      },
    },
  });

  return { ok: true, id: entry.id };
}
