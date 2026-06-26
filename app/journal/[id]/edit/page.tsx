import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountOptions, getJournalEntry } from "@/lib/journal/queries";
import { JournalForm } from "../../JournalForm";
import { linesToPairs } from "@/lib/journal/form";
import { updateEntryAction } from "./actions";

export default async function EditJournalEntryPage({
  params,
}: {
  // この版では動的セグメントは Promise で渡るため await して取り出す。
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  // 数値以外の URL（/journal/abc/edit など）は 404 に倒す。
  if (!Number.isInteger(id)) notFound();

  const session = await verifySession();
  const userId = Number(session.user.id);

  // 仕訳本体（所有スコープつき）と科目の選択肢を並列で取得する。
  const [entry, accounts] = await Promise.all([
    getJournalEntry(userId, id),
    getAccountOptions(userId),
  ]);
  // 他ユーザーの仕訳や存在しない ID は null → 404。
  if (!entry) notFound();

  // 既存明細を編集フォーム用の組に変換する（借方・貸方を上から詰める。詳細は linesToPairs）。
  const initialPairs = linesToPairs(entry.lines);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            仕訳の編集
          </h1>
          <Link
            href="/journal"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 仕訳一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <JournalForm
          accounts={accounts}
          // 対象 ID を結び付けた更新アクションを渡す。
          action={updateEntryAction.bind(null, id)}
          initialEntryDate={entry.entryDate}
          initialDescription={entry.description ?? undefined}
          initialPairs={initialPairs}
          submitLabel="更新"
          cancelHref="/journal"
        />
      </main>
    </div>
  );
}
