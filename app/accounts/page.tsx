import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getAccountsForManagement } from "@/lib/accounts/queries";
import { ACCOUNT_TYPE_LABEL, SIDE_LABEL } from "@/lib/ledger/types";

export default async function AccountsPage() {
  const session = await verifySession();
  const userId = Number(session.user.id);

  const accounts = await getAccountsForManagement(userId);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            科目管理
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
            勘定科目の追加・編集
          </h2>
          <Link
            href="/accounts/new"
            className="whitespace-nowrap rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            新規科目 +
          </Link>
        </div>

        {accounts.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            勘定科目がまだありません。「新規科目 +」から登録できます。
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <Link
                  href={`/accounts/${account.id}/edit`}
                  // 無効な科目は行ごと薄くして「使っていない」ことを見せる。
                  className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/4 dark:hover:bg-white/6 ${
                    account.isActive ? "" : "opacity-50"
                  }`}
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
                    {!account.isActive && (
                      <span className="shrink-0 rounded-full border border-black/12 px-2 py-0.5 text-xs text-zinc-500 dark:border-white/20 dark:text-zinc-400">
                        無効
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2 text-xs text-zinc-400">
                    {account.subAccountCount > 0 && (
                      <span>補助 {account.subAccountCount}</span>
                    )}
                    <span>
                      {ACCOUNT_TYPE_LABEL[account.accountType]}・
                      {SIDE_LABEL[account.normalSide]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-zinc-400">
          「資産・借方」などの表記は、科目の分類と通常残高の向き（残高が増える側）です。
        </p>
      </main>
    </div>
  );
}
