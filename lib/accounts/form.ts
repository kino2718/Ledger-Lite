// 科目管理フォームの FormData を、ドメインの入力型 AccountInput に変換する純粋関数。
// 値の妥当性検証は行わない（validateAccountInput など後段に委ねる）。
import type { AccountType, Side } from "@/lib/ledger/types";
import type { AccountInput } from "./validation";

// 科目フォームの Server Action が useActionState 経由で返す状態。
// 作成・編集で共通に使う（成功時はリダイレクトするため undefined を返す）。
export type AccountFormState = {
  errors?: string[];
};

export function parseAccountForm(formData: FormData): AccountInput {
  const codeRaw = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  // select / radio の値。想定外の文字列は validateAccountInput が弾く。
  const accountType = String(formData.get("accountType") ?? "") as AccountType;
  const normalSide = String(formData.get("normalSide") ?? "") as Side;
  // チェックボックスはチェック時のみ値が送られ、外すとフィールド自体が無い。
  const isActive = formData.get("isActive") !== null;

  return {
    code: codeRaw === "" ? null : codeRaw,
    name,
    accountType,
    normalSide,
    isActive,
  };
}
