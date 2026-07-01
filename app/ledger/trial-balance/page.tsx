import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getAccounts, getBalanceLines } from "@/lib/journal/queries";
import { computeTrialBalance } from "@/lib/ledger/balance";
import type { AccountType } from "@/lib/ledger/types";

// 金額を「¥1,234」形式に整形する。0 は空欄にして罫線をすっきりさせる。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const yenOrBlank = (n: number) => (n === 0 ? "" : yen(n));

// 科目分類の日本語ラベル。
const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
};

export default async function TrialBalancePage() {
  const session = await verifySession();
  const userId = Number(session.user.id);

  // 全科目（科目名・コード用）と、集計対象の明細を並列で取得する。
  const [accounts, lines] = await Promise.all([
    getAccounts(userId),
    getBalanceLines(userId),
  ]);

  const tb = computeTrialBalance(lines);

  // 各行に科目名・コードを付け、コード順に並べる（活動のある科目のみ）。
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const rows = tb.rows
    .map((row) => {
      const account = accountById.get(row.accountId);
      return {
        ...row,
        code: account?.code ?? "",
        name: account?.name ?? "(不明な科目)",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  // 貸借平均の検算：借方と貸方は合計・残高とも一致するはず。
  const balanced =
    tb.totalDebit === tb.totalCredit &&
    tb.totalDebitBalance === tb.totalCreditBalance;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            試算表
          </h1>
          <Link
            href="/ledger"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 総勘定元帳
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <p className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          合計残高試算表（全期間）
        </p>

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            集計できる仕訳がまだありません。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            {/* 借方（合計・残高）｜科目｜貸方（残高・合計）の合計残高試算表。
                min-w はスマホで列が潰れないための下限。PC では器いっぱいに広がる。 */}
            <table className="w-full min-w-2xl text-sm">
              <thead>
                <tr className="border-b border-black/8 text-xs text-zinc-400 dark:border-white/10">
                  <th className="px-4 py-2 text-right font-medium">借方合計</th>
                  <th className="px-3 py-2 text-right font-medium">借方残高</th>
                  <th className="px-4 py-2 text-left font-medium">科目</th>
                  <th className="px-3 py-2 text-right font-medium">貸方残高</th>
                  <th className="px-4 py-2 text-right font-medium">貸方合計</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.accountId}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {yenOrBlank(row.debit)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {yenOrBlank(row.debitBalance)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/ledger/${row.accountId}`}
                        className="inline-flex items-baseline gap-2 text-zinc-800 transition-colors hover:text-black dark:text-zinc-200 dark:hover:text-zinc-50"
                      >
                        {row.code && (
                          <span className="text-xs tabular-nums text-zinc-400">
                            {row.code}
                          </span>
                        )}
                        <span>{row.name}</span>
                        <span className="text-xs text-zinc-400">
                          {ACCOUNT_TYPE_LABEL[row.accountType]}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {yenOrBlank(row.creditBalance)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                      {yenOrBlank(row.credit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/12 font-semibold dark:border-white/20">
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {yen(tb.totalDebit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(tb.totalDebitBalance)}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    合計
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(tb.totalCreditBalance)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {yen(tb.totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 貸借平均の検算。通常は一致するが、崩れていれば警告する。 */}
        {rows.length > 0 && !balanced && (
          <p className="mt-4 rounded-xl border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-400">
            借方合計と貸方合計が一致しません。仕訳データを確認してください。
          </p>
        )}
      </main>
    </div>
  );
}
