import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountOptions, getJournalEntry } from "@/lib/journal/queries";
import { linesToPairs } from "@/lib/journal/form";
import { JournalForm } from "../JournalForm";
import { createEntryAction } from "./actions";

export default async function NewJournalEntryPage({
  searchParams,
}: {
  // この版ではクエリは Promise で渡るため await して取り出す。
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await verifySession();
  const userId = Number(session.user.id);
  const accounts = await getAccountOptions(userId);

  // ?from=<id> があればその仕訳をコピー元として読み、フォームに写す。
  // 取引日はコピーせず今日にする（過去の仕訳を雛形に今日の分を作る使い方を想定）。
  const { from } = await searchParams;
  const source = from !== undefined ? await loadSource(userId, from) : null;

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
        <JournalForm
          // コピー元を切り替えたときにフォームの状態を作り直す。
          key={source?.id ?? "blank"}
          accounts={accounts}
          action={createEntryAction}
          initialDescription={source?.description ?? undefined}
          initialPairs={source ? linesToPairs(source.lines) : undefined}
        />
      </main>
    </div>
  );
}

// コピー元の仕訳を取得する。不正な ID・他ユーザーの仕訳・存在しない ID は 404。
async function loadSource(userId: number, from: string) {
  const id = Number(from);
  if (!Number.isInteger(id)) notFound();
  const entry = await getJournalEntry(userId, id);
  if (!entry) notFound();
  return entry;
}
