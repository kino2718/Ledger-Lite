"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { deleteJournalEntry, updateJournalEntry } from "@/lib/journal/create";
import { parseJournalEntryForm } from "@/lib/journal/form";
import type { JournalFormState } from "@/lib/journal/form";

// 仕訳更新の Server Action。対象 ID はページ側で bind して渡すため第1引数に置く。
// useActionState から呼ばれるので、続いて前回の state と FormData を受け取る。
// 検証 NG なら errors を返し、成功時は一覧へリダイレクトする。
export async function updateEntryAction(
  id: number,
  _prevState: JournalFormState | undefined,
  formData: FormData,
): Promise<JournalFormState | undefined> {
  // フォームが認証ページ内でも、Server Action 側で必ず認証を確認する。
  const session = await verifySession();
  const userId = Number(session.user.id);

  // FormData → 入力データへの変換は作成と同じ純粋関数を使う。
  const input = parseJournalEntryForm(formData);
  const result = await updateJournalEntry(userId, id, input);

  if (!result.ok) {
    return { errors: result.errors };
  }

  // ダッシュボードと一覧の集計を最新化してから一覧へ遷移する。
  revalidatePath("/");
  revalidatePath("/journal");
  redirect("/journal");
}

// 仕訳削除の Server Action。対象 ID はページ側で bind して渡す。
// フォームの action として呼ばれると FormData が続けて渡るが、削除には使わないので
// 引数では受け取らない。所有者の仕訳でなければ deleteJournalEntry が { ok: false } を
// 返すが、その場合も結果は同じ（一覧へ戻る）ので戻り値は使わない。
export async function deleteEntryAction(id: number): Promise<void> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  await deleteJournalEntry(userId, id);

  // ダッシュボードと一覧の集計を最新化してから一覧へ遷移する。
  revalidatePath("/");
  revalidatePath("/journal");
  redirect("/journal");
}
