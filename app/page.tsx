import Link from "next/link";
import { signOut } from "@/auth";
import { verifySession } from "@/lib/session";
import {
  getAccounts,
  getBalanceLines,
  getRecentJournalEntries,
} from "@/lib/journal/queries";
import {
  carriesBalanceForward,
  computeAccountBalances,
  computeProfitLoss,
} from "@/lib/ledger/balance";
import { ACCOUNT_TYPE_LABEL } from "@/lib/ledger/types";
import { currentYear, yearRange } from "@/lib/ledger/period";
import { getAggregationStart } from "@/lib/closing/queries";
import { yen } from "@/lib/format";

// 今月（取引日 YYYY-MM-DD 文字列）の範囲を返す。
function currentMonthRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 始まり
  const mm = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    label: `${year}年${month + 1}月`,
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default async function Home() {
  // 未ログインなら /login へリダイレクトされる。
  const session = await verifySession();
  const userId = Number(session.user.id);
  const month = currentMonthRange();

  // 科目別残高は今年に固定する（年を切り替えたいときは総勘定元帳へ）。
  // 集計範囲は /ledger と同じルール:
  // - 資産・負債・純資産: 今年の年末までの累計（＝現時点の残高）
  // - 収益・費用: 今年の発生額（毎年ゼロから数え直す）
  const thisYear = currentYear();
  const period = yearRange(thisYear);

  // 締め済みの年があれば、累計は繰越仕訳の日付から集計する（二重計上防止）。
  const aggStart = await getAggregationStart(userId, thisYear);

  // 必要なデータをまとめて取得（互いに独立なので並列で）。
  const [stockLines, flowLines, monthLines, accounts, recent] =
    await Promise.all([
      getBalanceLines(userId, {
        ...(aggStart !== undefined ? { from: aggStart } : {}),
        to: period.to,
      }),
      getBalanceLines(userId, period),
      getBalanceLines(userId, { from: month.from, to: month.to }),
      getAccounts(userId),
      getRecentJournalEntries(userId),
    ]);

  // 今月の損益と、科目別残高を集計する。
  const pl = computeProfitLoss(monthLines);
  const balances = [
    ...computeAccountBalances(stockLines).filter((b) =>
      carriesBalanceForward(b.accountType),
    ),
    ...computeAccountBalances(flowLines).filter(
      (b) => !carriesBalanceForward(b.accountType),
    ),
  ];

  // 残高に科目名・コードを付け、コード順に並べる。
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const trialBalance = balances
    .map((b) => {
      const account = accountById.get(b.accountId);
      return {
        ...b,
        code: account?.code ?? "",
        name: account?.name ?? "(不明な科目)",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const hasEntries = recent.length > 0;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            Ledger Lite
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              {session.user.name ?? session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-full border border-black/12 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            ダッシュボード
          </h2>
          {/* スマホでは横幅が足りないと折り返す。各ボタン内では改行させない。 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/accounts"
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              科目管理
            </Link>
            <Link
              href="/ledger"
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              総勘定元帳
            </Link>
            <Link
              href="/journal"
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              仕訳一覧
            </Link>
            <Link
              href="/closing"
              className="whitespace-nowrap rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              決算
            </Link>
            <Link
              href="/journal/new"
              className="whitespace-nowrap rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
            >
              新規仕訳 +
            </Link>
          </div>
        </div>

        {/* 今月の損益 */}
        <section className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
          <h3 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            今月の損益（{month.label}）
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">収益</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-black dark:text-zinc-50">
                {yen(pl.revenue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">費用</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-black dark:text-zinc-50">
                {yen(pl.expense)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">差引</p>
              <p
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  pl.net >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {yen(pl.net)}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* 科目別残高 */}
          <section className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              科目別残高（{thisYear}年）
            </h3>
            {trialBalance.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                残高はまだありません。
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {trialBalance.map((row) => (
                    <tr
                      key={row.accountId}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-2">
                        <Link
                          href={`/ledger/${row.accountId}`}
                          className="text-zinc-800 transition-colors hover:text-black dark:text-zinc-200 dark:hover:text-zinc-50"
                        >
                          {row.name}
                          <span className="ml-2 text-xs text-zinc-400">
                            {ACCOUNT_TYPE_LABEL[row.accountType]}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {yen(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 最近の仕訳 */}
          <section className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                最近の仕訳
              </h3>
              {hasEntries && (
                <Link
                  href="/journal"
                  className="text-xs text-zinc-500 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  すべて見る →
                </Link>
              )}
            </div>
            {!hasEntries ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                仕訳はまだありません。「新規仕訳 +」から登録できます。
              </p>
            ) : (
              <ul className="flex flex-col">
                {recent.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <Link
                      href={`/journal/${entry.id}/edit`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-black/4 dark:hover:bg-white/6"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-zinc-800 dark:text-zinc-200">
                          {entry.description ?? "（摘要なし）"}
                        </p>
                        <p className="text-xs text-zinc-400">{entry.entryDate}</p>
                      </div>
                      <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">
                        {yen(entry.total)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
