import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getAccountOptions } from "@/lib/journal/queries";
import { JournalForm } from "./JournalForm";

export default async function NewJournalEntryPage() {
  const session = await verifySession();
  const accounts = await getAccountOptions(Number(session.user.id));

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            新規仕訳
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
        <JournalForm accounts={accounts} />
      </main>
    </div>
  );
}
