"use client";

import { useFormStatus } from "react-dom";

// 削除ボタン本体。フォーム送信中は押せないようにする（useFormStatus は
// 親 <form> の送信状態を読むため、submit する子要素として分けてある）。
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-full border border-red-600/40 px-5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-950/30"
    >
      {pending ? "削除中..." : "削除"}
    </button>
  );
}

// 削除ボタン（仕訳・科目などの削除ページで共用）。押すと確認ダイアログを出し、
// OK のときだけ削除アクションを実行する。
// action は対象 ID を bind 済みの Server Action をページ側から受け取る。
export function DeleteButton({
  action,
  confirmMessage,
}: {
  action: (formData: FormData) => void | Promise<void>;
  // 確認ダイアログに出す文言。何を削除するのかが伝わる文にすること。
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        // キャンセルされたら送信（Server Action 実行）を止める。
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <SubmitButton />
    </form>
  );
}
