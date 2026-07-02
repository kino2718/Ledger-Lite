"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { createAccount } from "@/lib/accounts/manage";
import { parseAccountForm } from "@/lib/accounts/form";
import type { AccountFormState } from "@/lib/accounts/form";

// 科目作成フォームの Server Action。useActionState から呼ばれるため、
// 第1引数に前回の state を受け取る。検証 NG なら errors を返し、
// 成功時は科目一覧へリダイレクトする。
export async function createAccountAction(
  _prevState: AccountFormState | undefined,
  formData: FormData,
): Promise<AccountFormState | undefined> {
  // フォームが認証ページ内でも、Server Action 側で必ず認証を確認する。
  const session = await verifySession();
  const userId = Number(session.user.id);

  const input = parseAccountForm(formData);
  const result = await createAccount(userId, input);

  if (!result.ok) {
    return { errors: result.errors };
  }

  // 科目一覧と、科目を参照する各画面（ダッシュボード・仕訳フォーム）を最新化する。
  revalidatePath("/");
  revalidatePath("/accounts");
  redirect("/accounts");
}
