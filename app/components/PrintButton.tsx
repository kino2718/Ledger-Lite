"use client";

// 「印刷 / PDF 保存」ボタン。ブラウザの印刷ダイアログを開くだけで、
// PDF として保存するかはダイアログ側で選ぶ（Cmd+P と同じ結果になる）。
// 印刷物にボタン自体は不要なので print:hidden で消す。
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 print:hidden dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
    >
      印刷 / PDF 保存
    </button>
  );
}
