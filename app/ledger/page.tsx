import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getAccounts, getBalanceLines } from "@/lib/journal/queries";
import { computeAccountBalances } from "@/lib/ledger/balance";
import type { AccountType } from "@/lib/ledger/types";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 科目分類の日本語ラベル。
const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
};

export default async function LedgerIndexPage() {
  const session = await verifySession();
  const userId = Number(session.user.id);

  // 全科目（コード順）と、残高表示用の集計を並列で取得する。
  const [accounts, lines] = await Promise.all([
    getAccounts(userId),
    getBalanceLines(userId),
  ]);

  // 科目別残高を引けるようにマップ化する（活動のない科目は残高 0 とみなす）。
  const balanceByAccount = new Map(
    computeAccountBalances(lines).map((b) => [b.accountId, b.balance]),
  );

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            科目を選んで元帳を表示
          </h2>
          <Link
            href="/ledger/trial-balance"
            className="rounded-full border border-black/12 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
          >
            試算表
          </Link>
        </div>

        {accounts.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            勘定科目がまだありません。
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <Link
                  href={`/ledger/${account.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/4 dark:hover:bg-white/6"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    {account.code && (
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                        {account.code}
                      </span>
                    )}
                    <span className="truncate text-zinc-800 dark:text-zinc-200">
                      {account.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {ACCOUNT_TYPE_LABEL[account.accountType]}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(balanceByAccount.get(account.id) ?? 0)}
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
