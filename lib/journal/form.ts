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

// フォーム入力中の片側（借方 or 貸方）の値。入力中は文字列で保持する。
export type SideInput = {
  accountId: string;
  subAccountId: string;
  amount: string;
};

// 借方・貸方を左右に並べた 1 組。片側だけ埋まることもある。
export type Pair = {
  debit: SideInput;
  credit: SideInput;
};

const emptySide = (): SideInput => ({
  accountId: "",
  subAccountId: "",
  amount: "",
});

// 1 明細をフォームの片側入力に変換する（数値→文字列、補助科目の null→""）。
function toSideInput(line: JournalLineInput): SideInput {
  return {
    accountId: String(line.accountId),
    subAccountId: line.subAccountId === null ? "" : String(line.subAccountId),
    amount: String(line.amount),
  };
}

/**
 * 既存明細を編集フォーム用の組（Pair）に変換する。parseJournalEntryForm の逆向き。
 * 借方・貸方をそれぞれ上から詰め、件数が違えば多いほうに合わせて空側で埋める。
 * 組の対応は表示上のもので、保存時に lineNo を振り直すため意味は変わらない。
 */
export function linesToPairs(lines: JournalLineInput[]): Pair[] {
  const debits = lines.filter((line) => line.side === "debit");
  const credits = lines.filter((line) => line.side === "credit");
  const rowCount = Math.max(debits.length, credits.length);
  return Array.from({ length: rowCount }, (_, i) => ({
    debit: debits[i] ? toSideInput(debits[i]) : emptySide(),
    credit: credits[i] ? toSideInput(credits[i]) : emptySide(),
  }));
}

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
