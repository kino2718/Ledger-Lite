"use client";

import { useActionState } from "react";
import type { AccountFormState } from "@/lib/accounts/form";

// 補助科目のインライン追加フォーム。追加に成功すると revalidate で一覧に
// 新しい行が現れ、フォームは自動リセットで空に戻る（追加フォームでは
// この挙動がそのまま望ましい）。
export function AddSubAccountForm({
  action,
}: {
  // 親の科目 ID を bind 済みの Server Action をページ側から受け取る。
  action: (
    prevState: AccountFormState | undefined,
    formData: FormData,
  ) => Promise<AccountFormState | undefined>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex items-center gap-3">
        <input
          name="name"
          type="text"
          required
          placeholder="補助科目名を入力"
          aria-label="新しい補助科目名"
          className="w-0 min-w-32 flex-1 rounded-lg border border-black/12 bg-transparent px-3 py-1.5 text-sm text-black outline-none focus:border-zinc-500 dark:border-white/20 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {pending ? "追加中..." : "追加"}
        </button>
      </form>

      {/* エラー表示（重複名など） */}
      {state?.errors && state.errors.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm text-red-600 dark:text-red-400">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
