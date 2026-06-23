"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { createJournalEntry } from "@/lib/journal/create";
import { parseJournalEntryForm } from "@/lib/journal/form";

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

  // FormData → 入力データへの変換は純粋関数に切り出してテスト可能にしている。
  const input = parseJournalEntryForm(formData);
  const result = await createJournalEntry(userId, input);

  if (!result.ok) {
    return { errors: result.errors };
  }

  // ダッシュボードの集計を最新化してから遷移する。
  revalidatePath("/");
  redirect("/");
}
