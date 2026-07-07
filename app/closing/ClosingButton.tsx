"use client";

import { useActionState } from "react";
import type { ClosingActionState } from "./actions";

// 締め・締め解除の実行ボタン。失敗したらボタンの下にエラーを表示する。
// action は対象の年を bind 済みの Server Action をページ側から受け取る。
export function ClosingButton({
  action,
  label,
  pendingLabel,
  confirmMessage,
  danger = false,
}: {
  action: (
    prevState: ClosingActionState,
    formData: FormData,
  ) => Promise<ClosingActionState>;
  label: string;
  pendingLabel: string;
  // 渡すと実行前に確認ダイアログを出す。締めは解除で元に戻せるので確認無し、
  // 締め解除は繰越仕訳と締めた日時の記録が消えるので確認ありにしている。
  confirmMessage?: string;
  // 締め解除のような取り消し系の操作は赤系の見た目にする。
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // 確認ダイアログがキャンセルされたら送信（Server Action 実行）を止める。
        if (confirmMessage !== undefined && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className={
          danger
            ? "whitespace-nowrap rounded-full border border-red-600/40 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-950/30"
            : "whitespace-nowrap rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        }
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.errors && state.errors.length > 0 && (
        <ul
          aria-live="polite"
          className="flex flex-col gap-1 rounded-lg border border-red-600/30 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
