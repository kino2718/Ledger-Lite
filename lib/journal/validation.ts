// 仕訳入力の検証（入力データだけで判定できる純粋ロジック）。DB には依存しない。
// 補助科目整合・所有ユーザー一致など、マスタ参照が要る検証は別関数で扱う。
import type { Side } from "@/lib/ledger/types";

// フォーム等から渡される 1 明細の入力。
export type JournalLineInput = {
  accountId: number;
  subAccountId: number | null;
  side: Side;
  amount: number;
};

// 1 仕訳の入力。
export type JournalEntryInput = {
  entryDate: string; // YYYY-MM-DD
  description: string | null;
  lines: JournalLineInput[];
};

// 検証結果。エラーは最初の 1 件で止めず、すべて集めて返す。
export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// entryDate が YYYY-MM-DD 形式で、かつ実在する暦日かを判定する。
function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  // new Date は 2026-02-30 のような繰り上がりを許すため、元の値と一致するか確認する。
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** 入力データだけで判定できる範囲で仕訳を検証し、エラーをまとめて返す。 */
export function validateJournalEntry(entry: JournalEntryInput): ValidationResult {
  const errors: string[] = [];

  if (!isValidDateString(entry.entryDate)) {
    errors.push("取引日は YYYY-MM-DD 形式の実在する日付で入力してください。");
  }

  if (entry.lines.length < 2) {
    errors.push("明細は借方・貸方で 2 行以上必要です。");
  }

  const hasInvalidAmount = entry.lines.some(
    (line) => !Number.isInteger(line.amount) || line.amount <= 0,
  );
  if (hasInvalidAmount) {
    errors.push("金額は 1 以上の整数で入力してください。");
  }

  const debit = sumBySide(entry.lines, "debit");
  const credit = sumBySide(entry.lines, "credit");
  if (debit !== credit) {
    errors.push("借方合計と貸方合計が一致していません。");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function sumBySide(lines: JournalLineInput[], side: Side): number {
  return lines
    .filter((line) => line.side === side)
    .reduce((sum, line) => sum + line.amount, 0);
}

// マスタ参照の検証に渡す勘定科目（補助科目つき）。
// 呼び出し側は「その仕訳のユーザーが所有する科目」だけを渡すこと。
// これにより、ここに無い accountId は「存在しない or 他ユーザーのもの」として弾ける。
export type SubAccountMaster = {
  id: number;
  isActive: boolean;
};

export type AccountMaster = {
  id: number;
  isActive: boolean;
  subAccounts: SubAccountMaster[];
};

/**
 * マスタ（勘定科目・補助科目）と照合して仕訳を検証する。
 * 科目の存在・所有ユーザー一致（accounts に含まれるか）・有効性、
 * および補助科目の整合（その科目に属するか）・有効性を確認する。
 * accounts はその仕訳のユーザーが所有する科目のみを渡す前提。
 */
export function validateAgainstMasters(
  entry: JournalEntryInput,
  accounts: AccountMaster[],
): ValidationResult {
  // 同種のメッセージを重複させないよう Set に集める。
  const errors = new Set<string>();
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  for (const line of entry.lines) {
    const account = accountById.get(line.accountId);
    if (!account) {
      // accounts はユーザー所有分のみなので、無ければ存在しないか他ユーザーのもの。
      errors.add("勘定科目が存在しないか、利用できません。");
      continue; // 科目が確定しないと補助科目の整合も判定できない。
    }
    if (!account.isActive) {
      errors.add("無効な勘定科目は使用できません。");
    }

    if (line.subAccountId !== null) {
      const sub = account.subAccounts.find((s) => s.id === line.subAccountId);
      if (!sub) {
        errors.add("補助科目がその勘定科目に属していません。");
      } else if (!sub.isActive) {
        errors.add("無効な補助科目は使用できません。");
      }
    }
  }

  return errors.size === 0 ? { ok: true } : { ok: false, errors: [...errors] };
}
