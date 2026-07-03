"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { deleteAccount, updateAccount } from "@/lib/accounts/manage";
import { parseAccountForm } from "@/lib/accounts/form";
import type { AccountFormState } from "@/lib/accounts/form";

// 科目更新の Server Action。対象 ID はページ側で bind して渡すため第1引数に置く。
// useActionState から呼ばれるので、続いて前回の state と FormData を受け取る。
// 検証 NG なら errors を返し、成功時は科目一覧へリダイレクトする。
export async function updateAccountAction(
  id: number,
  _prevState: AccountFormState | undefined,
  formData: FormData,
): Promise<AccountFormState | undefined> {
  // フォームが認証ページ内でも、Server Action 側で必ず認証を確認する。
  const session = await verifySession();
  const userId = Number(session.user.id);

  const input = parseAccountForm(formData);
  const result = await updateAccount(userId, id, input);

  if (!result.ok) {
    return { errors: result.errors };
  }

  // 科目一覧と、科目を参照する各画面（ダッシュボード・仕訳フォーム）を最新化する。
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}

// 科目削除の Server Action。対象 ID はページ側で bind して渡す。
// 削除ボタンは未使用（明細 0・補助科目 0）のときだけ表示するが、表示後に別タブで
// 仕訳が入った場合などは deleteAccount が { ok: false } を返して削除されない。
// その場合も結果は同じ（一覧へ戻る。科目は残ったまま）なので戻り値は使わない。
export async function deleteAccountAction(id: number): Promise<void> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  await deleteAccount(userId, id);

  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}
