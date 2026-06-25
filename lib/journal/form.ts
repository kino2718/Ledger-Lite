// 仕訳入力フォームの FormData を、ドメインの入力型 JournalEntryInput に変換する。
// 借方・貸方を左右に並べた pair 方式のフィールド名を読み出す純粋関数。
// 値の妥当性検証は行わない（validateJournalEntry など後段に委ねる）。
import type { Side } from "@/lib/ledger/types";
import type { JournalEntryInput, JournalLineInput } from "./validation";

// 仕訳フォームの Server Action が useActionState 経由で返す状態。
// 作成・編集で共通に使う（成功時はリダイレクトするため undefined を返す）。
export type JournalFormState = {
  errors?: string[];
};

export function parseJournalEntryForm(formData: FormData): JournalEntryInput {
  const entryDate = String(formData.get("entryDate") ?? "");
  const descriptionRaw = String(formData.get("description") ?? "");
  const description = descriptionRaw.trim() === "" ? null : descriptionRaw;

  // 明細は「組」が pairCount 件。各組に借方・貸方それぞれのフィールドがある。
  const pairCount = Number(formData.get("pairCount") ?? 0);
  const lines: JournalLineInput[] = [];

  const pushSide = (side: Side, i: number) => {
    const accountRaw = String(formData.get(`${side}AccountId.${i}`) ?? "");
    const amountRaw = String(formData.get(`${side}Amount.${i}`) ?? "");
    // 科目も金額も未入力ならその側は無視する（片側だけ入力された組への対応）。
    if (accountRaw === "" && amountRaw === "") return;
    const subRaw = String(formData.get(`${side}SubAccountId.${i}`) ?? "");
    lines.push({
      accountId: Number(accountRaw),
      subAccountId: subRaw === "" ? null : Number(subRaw),
      side,
      amount: Number(amountRaw),
    });
  };

  for (let i = 0; i < pairCount; i++) {
    pushSide("debit", i);
    pushSide("credit", i);
  }

  return { entryDate, description, lines };
}
