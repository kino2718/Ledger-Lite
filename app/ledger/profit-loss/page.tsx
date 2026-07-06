import Link from "next/link";
import { verifySession } from "@/lib/session";
import {
  getAccounts,
  getBalanceLines,
  getFirstEntryDate,
} from "@/lib/journal/queries";
import {
  computeAccountBalances,
  computeProfitLoss,
} from "@/lib/ledger/balance";
import type { AccountBalance } from "@/lib/ledger/types";
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

export default async function ProfitLossPage({
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

  // 全期間のときも、締め済みの年があれば繰越仕訳の日付から集計する
  // （他ページの全期間や、科目リンク先の元帳と金額を一致させるため）。
  // 年で絞ったときはその年の明細のみ（繰越仕訳に収益・費用は入らない）。
  // この開始日は「全期間」チップと見出しの表記にも使う。
  const aggStart = await getAggregationStart(userId);

  // 全科目（科目名・コード用）と、集計対象の明細を並列で取得する。
  const [accounts, lines, firstEntryDate] = await Promise.all([
    getAccounts(userId),
    getBalanceLines(
      userId,
      selection === "all"
        ? aggStart !== undefined
          ? { from: aggStart }
          : undefined
        : yearRange(selection),
    ),
    getFirstEntryDate(userId),
  ]);

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );

  // 科目別残高から収益・費用だけを取り出し、科目名を付けてコード順に並べる。
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const toRows = (balances: AccountBalance[]) =>
    balances
      .map((b) => {
        const account = accountById.get(b.accountId);
        return {
          ...b,
          code: account?.code ?? "",
          name: account?.name ?? "(不明な科目)",
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

  const balances = computeAccountBalances(lines);
  const revenueRows = toRows(balances.filter((b) => b.accountType === "revenue"));
  const expenseRows = toRows(balances.filter((b) => b.accountType === "expense"));

  // 合計と差引損益は既存の集計関数で出す（科目別の合算と一致する）。
  const pl = computeProfitLoss(lines);

  const hasContent = revenueRows.length > 0 || expenseRows.length > 0;

  // 科目リンクは選択中の年を引き継いで元帳を開く。
  const yearParamValue = selection === "all" ? "all" : String(selection);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            損益計算書
          </h1>
          <Link
            href={`/ledger?year=${yearParamValue}`}
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 総勘定元帳
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {/* 年セレクタ。集計対象の年を切り替える（既定は今年）。 */}
        <div className="mb-4">
          <YearFilter
            basePath="/ledger/profit-loss"
            years={years}
            selection={selection}
            allLabel={allPeriodLabel(aggStart)}
          />
        </div>

        <p className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          損益計算書（
          {selection === "all" ? allPeriodLabel(aggStart) : `${selection}年`}）
        </p>

        {!hasContent ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {firstEntryDate !== null && selection !== "all"
              ? `${selection}年の収益・費用の仕訳はありません。`
              : "集計できる仕訳がまだありません。"}
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <tbody>
                {/* 収益の部 */}
                <SectionHeader label="収益" />
                {revenueRows.map((row) => (
                  <AccountRow
                    key={row.accountId}
                    row={row}
                    yearParamValue={yearParamValue}
                  />
                ))}
                <SubtotalRow label="収益合計" amount={pl.revenue} />

                {/* 費用の部 */}
                <SectionHeader label="費用" />
                {expenseRows.map((row) => (
                  <AccountRow
                    key={row.accountId}
                    row={row}
                    yearParamValue={yearParamValue}
                  />
                ))}
                <SubtotalRow label="費用合計" amount={pl.expense} />
              </tbody>
              <tfoot>
                {/* 差引損益。青色申告決算書でいう特別控除前の所得にあたる。 */}
                <tr className="border-t-2 border-black/12 dark:border-white/20">
                  <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                    差引損益
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      青色申告特別控除前の所得
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-base font-semibold tabular-nums ${
                      pl.net >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {yen(pl.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

// 「収益」「費用」の部の見出し行。
function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="border-b border-black/8 dark:border-white/10">
      <td
        colSpan={2}
        className="bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
      >
        {label}
      </td>
    </tr>
  );
}

// 科目 1 行。科目名は選択中の年の元帳へのリンク。
function AccountRow({
  row,
  yearParamValue,
}: {
  row: { accountId: number; code: string; name: string; balance: number };
  yearParamValue: string;
}) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      <td className="px-4 py-2">
        <Link
          href={`/ledger/${row.accountId}?year=${yearParamValue}`}
          className="inline-flex items-baseline gap-2 text-zinc-800 transition-colors hover:text-black dark:text-zinc-200 dark:hover:text-zinc-50"
        >
          {row.code && (
            <span className="text-xs tabular-nums text-zinc-400">
              {row.code}
            </span>
          )}
          <span>{row.name}</span>
        </Link>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {yen(row.balance)}
      </td>
    </tr>
  );
}

// 部の合計行。
function SubtotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-b border-black/8 dark:border-white/10">
      <td className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </td>
      <td className="px-4 py-2 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
        {yen(amount)}
      </td>
    </tr>
  );
}
