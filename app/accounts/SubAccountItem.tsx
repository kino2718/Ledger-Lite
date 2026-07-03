"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { AccountFormState } from "@/lib/accounts/form";

// 削除ボタン本体。送信中は押せないようにする（useFormStatus は親 <form> の
// 送信状態を読むため、submit する子要素として分けてある）。
function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-full border border-red-600/40 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-950/30"
    >
      削除
    </button>
  );
}

// 補助科目 1 行分。名前の変更・有効/無効の切替（保存ボタンでまとめて更新）と、
// 未使用（明細ゼロ）のときだけ削除ができる。
// 更新と削除は別の Server Action なので、行の中に 2 つの <form> を並べる
// （HTML はフォームの入れ子を許さないため、兄弟に分ける）。
export function SubAccountItem({
  name,
  isActive,
  inUse,
  updateAction,
  deleteAction,
}: {
  name: string;
  isActive: boolean;
  inUse: boolean;
  // どちらも対象 ID を bind 済みの Server Action をページ側から受け取る。
  updateAction: (
    prevState: AccountFormState | undefined,
    formData: FormData,
  ) => Promise<AccountFormState | undefined>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(updateAction, undefined);

  return (
    <li className="flex flex-col gap-2 border-b border-black/5 px-4 py-3 last:border-0 dark:border-white/5">
      <div className="flex items-center gap-3">
        <form
          action={formAction}
          className={`flex min-w-0 flex-1 flex-wrap items-center gap-3 ${
            isActive ? "" : "opacity-50"
          }`}
        >
          <input
            name="name"
            type="text"
            required
            defaultValue={name}
            aria-label="補助科目名"
            className="w-0 min-w-32 flex-1 rounded-lg border border-black/12 bg-transparent px-3 py-1.5 text-sm text-black outline-none focus:border-zinc-500 dark:border-white/20 dark:text-zinc-50"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={isActive}
              className="accent-black dark:accent-zinc-50"
            />
            有効
          </label>
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-full border border-black/12 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:text-zinc-300 dark:hover:bg-white/6"
          >
            {pending ? "保存中..." : "保存"}
          </button>
        </form>

        {inUse ? (
          <span className="shrink-0 text-xs text-zinc-400">使用中</span>
        ) : (
          <form
            action={deleteAction}
            onSubmit={(e) => {
              // キャンセルされたら送信（Server Action 実行）を止める。
              if (
                !window.confirm(
                  "この補助科目を削除します。元に戻せません。よろしいですか？",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <DeleteButton />
          </form>
        )}
      </div>

      {/* エラー表示（重複名など） */}
      {state?.errors && state.errors.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-1 text-sm text-red-600 dark:text-red-400">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
