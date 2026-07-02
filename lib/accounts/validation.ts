// 勘定科目・補助科目の入力検証（入力データだけで判定できる純粋ロジック）。DB には依存しない。
// コード・名前の重複や使用中科目の変更制限など、マスタ参照が要る検証は manage.ts 側で扱う。
import type { AccountType, Side } from "@/lib/ledger/types";
import type { ValidationResult } from "@/lib/journal/validation";

// フォーム等から渡される勘定科目の入力。
export type AccountInput = {
  code: string | null;
  name: string;
  accountType: AccountType;
  normalSide: Side;
  isActive: boolean;
};

// フォーム経由では型どおりの値とは限らないため、実行時にも値を確かめる。
const ACCOUNT_TYPES: readonly string[] = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
];
const SIDES: readonly string[] = ["debit", "credit"];

/** 入力データだけで判定できる範囲で勘定科目を検証し、エラーをまとめて返す。 */
export function validateAccountInput(input: AccountInput): ValidationResult {
  const errors: string[] = [];

  if (input.name.trim() === "") {
    errors.push("科目名を入力してください。");
  }

  if (!ACCOUNT_TYPES.includes(input.accountType)) {
    errors.push("分類の値が正しくありません。");
  }

  if (!SIDES.includes(input.normalSide)) {
    errors.push("通常残高の向きの値が正しくありません。");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/** 補助科目名を検証する。 */
export function validateSubAccountName(name: string): ValidationResult {
  if (name.trim() === "") {
    return { ok: false, errors: ["補助科目名を入力してください。"] };
  }
  return { ok: true };
}
