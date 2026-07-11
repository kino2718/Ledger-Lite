import Link from "next/link";
import { verifySession } from "@/lib/session";
import {
  getAccounts,
  getBalanceLines,
  getFirstEntryDate,
  getLedgerLines,
  getOpeningBalance,
} from "@/lib/journal/queries";
import { buildLedgerRows } from "@/lib/ledger/ledger";
import {
  carriesBalanceForward,
  computeAccountBalances,
} from "@/lib/ledger/balance";
import { ACCOUNT_TYPE_LABEL } from "@/lib/ledger/types";
import {
  allPeriodLabel,
  currentYear,
  resolveYearSelection,
  yearOf,
  yearOptions,
  yearRange,
} from "@/lib/ledger/period";
import { YearFilter } from "@/app/components/YearFilter";
import { PrintButton } from "@/app/components/PrintButton";
import { getAggregationStart } from "@/lib/closing/queries";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 元帳テーブルの列幅。個別元帳よりひとまわり詰めて A4 縦の紙幅にも収める。
const GRID_COLS = "grid-cols-[5.5rem_minmax(7rem,1fr)_6rem_6.5rem_6.5rem_7rem]";

// 総勘定元帳の一括印刷ページ。紙の元帳のように「仕訳のある科目」を
// コード順に全部並べ、印刷時は科目ごとに改ページする。画面でそのまま
// プレビューでき、「印刷 / PDF 保存」でブラウザの印刷ダイアログを開く。
export default async function LedgerPrintPage({
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
  const period = selection === "all" ? undefined : yearRange(selection);

  // 締め済みの年があれば、累計は繰越仕訳の日付から集計する（二重計上防止）。
  // allStart は最新の締めに基づく開始日で、「全期間」の表記に使う。
  const [aggStart, allStart] = await Promise.all([
    getAggregationStart(userId, selection === "all" ? undefined : selection),
    getAggregationStart(userId),
  ]);

  // 掲載する科目は /ledger（科目一覧）と同じ基準：集計範囲に仕訳のある科目。
  // 資産・負債・純資産は年末までの累計、収益・費用は選択年の発生分で判定する。
  const stockRange = {
    ...(aggStart !== undefined ? { from: aggStart } : {}),
    ...(period ? { to: period.to } : {}),
  };
  const [accounts, stockLines, flowLines, firstEntryDate] = await Promise.all([
    getAccounts(userId),
    getBalanceLines(userId, stockRange),
    period ? getBalanceLines(userId, period) : null,
    getFirstEntryDate(userId),
  ]);
  const stockBalances = new Map(
    computeAccountBalances(stockLines).map((b) => [b.accountId, b.balance]),
  );
  const flowBalances =
    flowLines === null
      ? stockBalances
      : new Map(
          computeAccountBalances(flowLines).map((b) => [b.accountId, b.balance]),
        );
  const usedAccounts = accounts.filter((account) =>
    (carriesBalanceForward(account.accountType) ? stockBalances : flowBalances).has(
      account.id,
    ),
  );

  // 明細の取得範囲。個別元帳（/ledger/[accountId]）と同じ。
  const linePeriod =
    selection === "all"
      ? aggStart !== undefined
        ? { from: aggStart }
        : undefined
      : yearRange(selection);

  // 科目ごとに個別元帳と同じパイプラインで行を組み立てる。
  // 補助科目では絞らず科目全体を出す（補助科目名は行に添える）。
  const sections = await Promise.all(
    usedAccounts.map(async (account) => {
      const carriesForward = carriesBalanceForward(account.accountType);
      const openingBalance =
        selection === "all" || !carriesForward
          ? 0
          : await getOpeningBalance({
              userId,
              accountId: account.id,
              normalSide: account.normalSide,
              before: `${selection}-01-01`,
              from: aggStart,
            });
      const lines = await getLedgerLines(
        userId,
        account.id,
        undefined,
        linePeriod,
      );
      const rows = buildLedgerRows({
        lines,
        normalSide: account.normalSide,
        openingBalance,
      });
      return {
        account,
        rows,
        openingBalance,
        closingBalance:
          rows.length > 0 ? rows[rows.length - 1].balance : openingBalance,
        // 前期繰越行は年で絞ったとき、繰り越す残高がある場合だけ出す
        // （前年を締めた年は繰越仕訳の行が出るので、この行は不要になる）。
        showOpeningRow:
          selection !== "all" && carriesForward && openingBalance !== 0,
      };
    }),
  );

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );
  const yearParamValue = selection === "all" ? "all" : String(selection);
  const periodLabel =
    selection === "all" ? allPeriodLabel(allStart) : `${selection}年`;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 print:bg-white dark:bg-black">
      {/* ナビゲーションは印刷物には不要なので隠す（帳票名は下の見出しが担う）。 */}
      <header className="border-b border-black/8 print:hidden dark:border-white/10">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            総勘定元帳（印刷用）
          </h1>
          <Link
            href={`/ledger?year=${yearParamValue}`}
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 科目一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {/* 年セレクタ。印刷対象の年を切り替える（既定は今年）。 */}
        <div className="mb-4 print:hidden">
          <YearFilter
            basePath="/ledger/print"
            years={years}
            selection={selection}
            allLabel={allPeriodLabel(allStart)}
          />
        </div>

        {/* この見出しが印刷物の表題を兼ねる（帳票名＋対象期間）。 */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-500 print:text-base print:font-semibold print:text-black dark:text-zinc-400">
            総勘定元帳（{periodLabel}）・{sections.length} 科目
          </p>
          <PrintButton />
        </div>

        {sections.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {accounts.length === 0
              ? "勘定科目がまだありません。"
              : "この期間に仕訳のある科目はありません。"}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {sections.map((section, i) => (
              // 紙の元帳の慣習に合わせ、2 科目め以降は科目ごとに改ページする。
              <section
                key={section.account.id}
                className={i > 0 ? "break-before-page" : undefined}
              >
                {/* 科目の見出し（科目名・分類・最終残高）。 */}
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-black dark:text-zinc-50">
                    {section.account.name}
                    <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {ACCOUNT_TYPE_LABEL[section.account.accountType]}
                    </span>
                  </h2>
                  <p className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                    残高{" "}
                    <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {yen(section.closingBalance)}
                    </span>
                  </p>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white shadow-sm print:overflow-visible print:rounded-none print:border-black/40 print:shadow-none dark:border-white/10 dark:bg-zinc-950">
                  <div className="min-w-xl text-sm print:min-w-0 print:text-xs">
                    {/* ヘッダー行 */}
                    <div
                      className={`grid ${GRID_COLS} gap-2 border-b border-black/8 px-4 py-2 text-xs font-medium text-zinc-400 print:border-black/40 print:text-black dark:border-white/10`}
                    >
                      <span>日付</span>
                      <span>摘要</span>
                      <span>相手科目</span>
                      <span className="text-right">借方</span>
                      <span className="text-right">貸方</span>
                      <span className="text-right">残高</span>
                    </div>
                    {/* 前期繰越行（年で絞ったときのみ）。 */}
                    {section.showOpeningRow && (
                      <div
                        className={`grid ${GRID_COLS} break-inside-avoid gap-2 border-b border-black/5 px-4 py-2 print:border-black/25 dark:border-white/5`}
                      >
                        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                          {selection}-01-01
                        </span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          前期繰越
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">—</span>
                        <span />
                        <span />
                        <span className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                          {yen(section.openingBalance)}
                        </span>
                      </div>
                    )}
                    {/* 明細行。印刷用なので編集ページへのリンクにはしない。 */}
                    {section.rows.map((row, j) => (
                      <div
                        key={`${row.entryId}-${j}`}
                        className={`grid ${GRID_COLS} break-inside-avoid gap-2 border-b border-black/5 px-4 py-2 last:border-0 print:border-black/25 dark:border-white/5`}
                      >
                        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                          {row.entryDate}
                        </span>
                        {/* 摘要。補助科目があれば添える。印刷では折り返して全文を出す。 */}
                        <span className="truncate text-zinc-800 print:whitespace-normal dark:text-zinc-200">
                          {row.description ?? "（摘要なし）"}
                          {row.subAccountName && (
                            <span className="ml-1 text-xs text-zinc-400 print:text-zinc-600">
                              ／{row.subAccountName}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-zinc-600 print:whitespace-normal dark:text-zinc-400">
                          {row.counterLabel || "—"}
                        </span>
                        <span className="text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                          {row.debit ? yen(row.debit) : ""}
                        </span>
                        <span className="text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                          {row.credit ? yen(row.credit) : ""}
                        </span>
                        <span className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                          {yen(row.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
