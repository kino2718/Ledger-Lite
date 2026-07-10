import Link from "next/link";
import { verifySession } from "@/lib/session";
import {
  getAccounts,
  getBalanceLines,
  getFirstEntryDate,
} from "@/lib/journal/queries";
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
import { getAggregationStart } from "@/lib/closing/queries";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default async function LedgerIndexPage({
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
  // allStart は最新の締めに基づく開始日で、「全期間」チップの表記に使う。
  const [aggStart, allStart] = await Promise.all([
    getAggregationStart(userId, selection === "all" ? undefined : selection),
    getAggregationStart(userId),
  ]);

  // 残高の集計範囲は科目の種類で分ける。
  // - 資産・負債・純資産: 選択年の年末までの累計（＝年末時点の残高）
  // - 収益・費用: 選択年の発生額（毎年ゼロから数え直す）
  // 全期間選択時はどちらも同じ範囲の累計なので、集計は 1 回で済ませる。
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

  // 科目別残高を引けるようにマップ化する（活動のない科目は残高 0 とみなす）。
  const stockBalances = new Map(
    computeAccountBalances(stockLines).map((b) => [b.accountId, b.balance]),
  );
  const flowBalances =
    flowLines === null
      ? stockBalances
      : new Map(
          computeAccountBalances(flowLines).map((b) => [b.accountId, b.balance]),
        );

  // 一覧に出す金額。その科目の元帳を同じ年で開いたときの最終残高と一致する。
  const balanceMapFor = (account: (typeof accounts)[number]) =>
    carriesBalanceForward(account.accountType) ? stockBalances : flowBalances;
  const balanceFor = (account: (typeof accounts)[number]) =>
    balanceMapFor(account).get(account.id) ?? 0;

  // 集計範囲に仕訳のある科目だけを一覧に出す（ダッシュボードと同じ基準）。
  // 未使用の科目まで並べると標準の科目だけで 45 件になり探しづらいため。
  // 差引ゼロでも仕訳があれば表示される。
  const usedAccounts = accounts.filter((account) =>
    balanceMapFor(account).has(account.id),
  );

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );

  // 科目・試算表へのリンクは選択中の年を引き継ぐ。
  const yearParamValue = selection === "all" ? "all" : String(selection);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            総勘定元帳
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
        {/* 年セレクタ。残高の集計対象年を切り替える（既定は今年）。 */}
        <div className="mb-4">
          <YearFilter
            basePath="/ledger"
            years={years}
            selection={selection}
            allLabel={allPeriodLabel(allStart)}
          />
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            科目を選んで元帳を表示
          </h2>
          {/* 決算レポートへの導線。選択中の年を引き継ぐ。 */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={`/ledger/trial-balance?year=${yearParamValue}`}
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              試算表
            </Link>
            <Link
              href={`/ledger/profit-loss?year=${yearParamValue}`}
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              損益計算書
            </Link>
            <Link
              href={`/ledger/balance-sheet?year=${yearParamValue}`}
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              貸借対照表
            </Link>
          </div>
        </div>

        {usedAccounts.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {accounts.length === 0
              ? "勘定科目がまだありません。"
              : "この期間に仕訳のある科目はありません。"}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            {usedAccounts.map((account) => (
              <li
                key={account.id}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <Link
                  href={`/ledger/${account.id}?year=${yearParamValue}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/4 dark:hover:bg-white/6"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-zinc-800 dark:text-zinc-200">
                      {account.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {ACCOUNT_TYPE_LABEL[account.accountType]}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(balanceFor(account))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
