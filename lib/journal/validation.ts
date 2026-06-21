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
