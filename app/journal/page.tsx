import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getJournalEntries } from "@/lib/journal/queries";
import type { JournalEntryLineView } from "@/lib/journal/queries";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 借方・貸方それぞれの明細を縦に並べる（科目名＋補助科目と金額）。
function LineColumn({
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
            <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
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

export default async function JournalListPage() {
  const session = await verifySession();
  const entries = await getJournalEntries(Number(session.user.id));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            仕訳一覧
          </h1>
          <Link
            href="/"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← ダッシュボード
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            全 {entries.length} 件
          </h2>
          <Link
            href="/journal/new"
            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            新規仕訳 +
          </Link>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            仕訳はまだありません。「新規仕訳 +」から登録できます。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              // 仕訳帳スタイル：借方を左・貸方を右に並べて科目まで一目で見えるようにする。
              const debits = entry.lines.filter((l) => l.side === "debit");
              const credits = entry.lines.filter((l) => l.side === "credit");
              return (
                <li key={entry.id}>
                  <Link
                    href={`/journal/${entry.id}/edit`}
                    className="block rounded-2xl border border-black/8 bg-white p-4 shadow-sm transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/30"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-zinc-800 dark:text-zinc-200">
                          {entry.description ?? "（摘要なし）"}
                        </p>
                        <p className="text-xs text-zinc-400">{entry.entryDate}</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {yen(entry.total)}
                      </span>
                    </div>
                    {/* スマホは借方・貸方を縦積み、PC（sm 以上）は左右に並べる。 */}
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      <LineColumn label="借方" lines={debits} />
                      <LineColumn label="貸方" lines={credits} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
