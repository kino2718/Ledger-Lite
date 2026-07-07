"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/session";
import { closeYear, reopenYear } from "@/lib/closing/manage";

// 締め・締め解除の Server Action の結果。useActionState から呼ばれるため、
// 失敗時は errors を返し、成功時はリダイレクトする（値は返らない）。
export type ClosingActionState = { errors: string[] } | undefined;

// 年 year を締める。対象の年はページ側で bind して渡す。
// useActionState から呼ばれると前回の state と FormData が続けて渡るが、
// どちらも使わないので引数では受け取らない。
export async function closeYearAction(
  year: number,
): Promise<ClosingActionState> {
  // ボタンが認証ページ内でも、Server Action 側で必ず認証を確認する。
  const session = await verifySession();
  const userId = Number(session.user.id);

  const result = await closeYear(userId, year);
  if (!result.ok) {
    return { errors: result.errors };
  }

  // 締めはダッシュボード・元帳・各レポートの集計すべてに影響するため、
  // ページ単位ではなく全体のキャッシュを最新化する。
  revalidatePath("/", "layout");
  redirect("/closing");
}

// 年 year の締めを解除する。対象の年はページ側で bind して渡す。
export async function reopenYearAction(
  year: number,
): Promise<ClosingActionState> {
  const session = await verifySession();
  const userId = Number(session.user.id);

  const result = await reopenYear(userId, year);
  if (!result.ok) {
    return { errors: result.errors };
  }

  revalidatePath("/", "layout");
  redirect("/closing");
}
