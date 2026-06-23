"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { createJournalEntry } from "@/lib/journal/create";
import type { JournalLineInput } from "@/lib/journal/validation";

export type NewEntryState = {
  errors?: string[];
};

// 仕訳入力フォームの Server Action。useActionState から呼ばれるため、
// 第1引数に前回の state を受け取る。検証 NG なら errors を返し、
// 成功時はダッシュボードへリダイレクトする。
export async function createEntryAction(
  _prevState: NewEntryState | undefined,
  formData: FormData,
): Promise<NewEntryState | undefined> {
  // フォームが認証ページ内でも、Server Action 側で必ず認証を確認する。
  const session = await verifySession();
  const userId = Number(session.user.id);

  const entryDate = String(formData.get("entryDate") ?? "");
  const descriptionRaw = String(formData.get("description") ?? "");
  const description = descriptionRaw.trim() === "" ? null : descriptionRaw;

  // 借方・貸方を左右に並べた「組」を pairCount 個ぶん受け取る。
  // 片側だけ入力された組もあるため、入力の無い側（科目も金額も空）は無視する。
  const pairCount = Number(formData.get("pairCount") ?? 0);
  const lines: JournalLineInput[] = [];

  const pushSide = (side: "debit" | "credit", i: number) => {
    const accountRaw = String(formData.get(`${side}AccountId.${i}`) ?? "");
    const amountRaw = String(formData.get(`${side}Amount.${i}`) ?? "");
    // 科目も金額も未入力ならその側は無視する。
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

  const result = await createJournalEntry(userId, {
    entryDate,
    description,
    lines,
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  // ダッシュボードの集計を最新化してから遷移する。
  revalidatePath("/");
  redirect("/");
}
