import type { JournalEntryLineView } from "@/lib/journal/queries";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 借方・貸方それぞれの明細を縦に並べる（科目名＋補助科目と金額）。
// 仕訳一覧と、締め済みの仕訳の読み取り専用表示で共用する。
export function LineColumn({
  label,
  lines,
}: {
  label: string;
  lines: JournalEntryLineView[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      {lines.length === 0 ? (
        <p className="text-sm text-zinc-300 dark:text-zinc-600">—</p>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            {/* 画面では 1 行に省略、印刷では折り返して全文を出す。 */}
            <span className="min-w-0 truncate text-zinc-800 print:whitespace-normal dark:text-zinc-200">
              {line.accountName}
              {line.subAccountName && (
                <span className="ml-1 text-xs text-zinc-400">
                  / {line.subAccountName}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
              {yen(line.amount)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
