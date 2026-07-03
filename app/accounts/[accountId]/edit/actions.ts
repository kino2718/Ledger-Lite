"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import {
  createSubAccount,
  deleteAccount,
  deleteSubAccount,
  updateAccount,
  updateSubAccount,
} from "@/lib/accounts/manage";
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

// 補助科目の操作後に、表示に影響するページを再描画させる。
// 編集ページ（補助科目一覧そのもの）と科目一覧（「補助 N」の件数表示）。
// redirect はせず、同じ編集ページに留まる。
function revalidateSubAccounts(accountId: number) {
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}/edit`);
}

// 補助科目追加の Server Action。親の科目 ID はページ側で bind して渡す。
// 検証 NG なら errors を返し、成功時は再描画で一覧に新しい行が現れる。
export async function addSubAccountAction(
  accountId: number,
  _prevState: AccountFormState | undefined,
  formData: FormData,
): Promise<AccountFormState | undefined> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  const name = String(formData.get("name") ?? "");
  const result = await createSubAccount(userId, accountId, name);

  if (!result.ok) {
    return { errors: result.errors };
  }

  revalidateSubAccounts(accountId);
  return undefined;
}

// 補助科目の名前・有効/無効を更新する Server Action。
// 親の科目 ID（再描画用）と補助科目 ID をページ側で bind して渡す。
export async function updateSubAccountAction(
  accountId: number,
  subAccountId: number,
  _prevState: AccountFormState | undefined,
  formData: FormData,
): Promise<AccountFormState | undefined> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  const name = String(formData.get("name") ?? "");
  // チェックボックスはチェック時だけ送られてくる（parseAccountForm と同じ判定）。
  const isActive = formData.get("isActive") !== null;
  const result = await updateSubAccount(userId, subAccountId, {
    name,
    isActive,
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  revalidateSubAccounts(accountId);
  return undefined;
}

// 補助科目削除の Server Action。削除ボタンは未使用（明細 0）のときだけ表示するが、
// 表示後に仕訳が入った場合は deleteSubAccount が拒否する（行が残るだけ）ので
// 戻り値は使わない。
export async function deleteSubAccountAction(
  accountId: number,
  subAccountId: number,
): Promise<void> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  await deleteSubAccount(userId, subAccountId);

  revalidateSubAccounts(accountId);
}
