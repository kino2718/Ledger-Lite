import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getFirstEntryDate, getJournalEntries } from "@/lib/journal/queries";
import {
  currentYear,
  resolveYearSelection,
  yearOf,
  yearOptions,
  yearRange,
} from "@/lib/ledger/period";
import { YearFilter } from "@/app/components/YearFilter";
import { PrintButton } from "@/app/components/PrintButton";
import { LineColumn } from "./LineColumn";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default async function JournalListPage({
  searchParams,
}: {
  // この版ではクエリは Promise で渡るため await して取り出す。
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await verifySession();
  const userId = Number(session.user.id);

  // ?year= を解釈する（未指定・不正値は今年、"all" は全期間）。
  const { year: yearParam } = await searchParams;
  const thisYear = currentYear();
  const selection = resolveYearSelection(yearParam, thisYear);

  const entries = await getJournalEntries(
    userId,
    selection === "all" ? undefined : yearRange(selection),
  );

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const firstEntryDate = await getFirstEntryDate(userId);
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 print:bg-white dark:bg-black">
      {/* ナビゲーションは印刷物には不要なので隠す（帳票名は下の見出しが担う）。 */}
      <header className="border-b border-black/8 print:hidden dark:border-white/10">
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {/* 年セレクタ。表示する年を切り替える（既定は今年）。 */}
        <div className="mb-4 print:hidden">
          <YearFilter basePath="/journal" years={years} selection={selection} />
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          {/* この見出しが印刷物の表題を兼ねる。印刷時だけ帳票名を前置する。 */}
          <h2 className="text-sm font-medium text-zinc-500 print:text-base print:font-semibold print:text-black dark:text-zinc-400">
            <span className="hidden print:inline">仕訳帳（</span>
            {selection === "all" ? "全期間" : `${selection}年`}・
            {entries.length} 件
            <span className="hidden print:inline">）</span>
          </h2>
          <div className="flex items-center gap-2">
            <PrintButton />
            <Link
              href="/journal/new"
              className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 print:hidden dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
            >
              新規仕訳 +
            </Link>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {/* 仕訳が 1 件も無いときと、選んだ年に無いだけのときで文言を分ける。 */}
            {firstEntryDate !== null && selection !== "all"
              ? `${selection}年の仕訳はありません。`
              : "仕訳はまだありません。「新規仕訳 +」から登録できます。"}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              // 仕訳帳スタイル：借方を左・貸方を右に並べて科目まで一目で見えるようにする。
              const debits = entry.lines.filter((l) => l.side === "debit");
              const credits = entry.lines.filter((l) => l.side === "credit");
              // 1 仕訳＝1 カード。印刷では途中で改ページさせない。
              return (
                <li key={entry.id} className="break-inside-avoid">
                  <Link
                    href={`/journal/${entry.id}/edit`}
                    className="block rounded-2xl border border-black/8 bg-white p-4 shadow-sm transition-colors hover:border-black/20 print:rounded-none print:border-black/40 print:shadow-none dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/30"
                  >
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-baseline gap-2 text-zinc-800 dark:text-zinc-200">
                          {/* 画面では 1 行に省略、印刷では折り返して全文を出す。 */}
                          <span className="truncate print:whitespace-normal">
                            {entry.description ?? "（摘要なし）"}
                          </span>
                          {/* 年度締めで作られた繰越仕訳の目印。 */}
                          {entry.isOpening && (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              繰越
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-400">{entry.entryDate}</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {yen(entry.total)}
                      </span>
                    </div>
                    {/* スマホは借方・貸方を縦積み、PC（sm 以上）は左右に並べる。
                        印刷幅は sm 前後で揺れるため、紙では左右 2 列を明示する。 */}
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
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
