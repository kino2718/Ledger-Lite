import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountOptions, getJournalEntry } from "@/lib/journal/queries";
import { JournalForm } from "../../JournalForm";
import { DeleteEntryButton } from "../../DeleteEntryButton";
import { linesToPairs } from "@/lib/journal/form";
import { deleteEntryAction, updateEntryAction } from "./actions";

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

        {/* 削除はフォームと独立した操作なので、区切って下部に配置する。 */}
        <div className="mt-8 flex items-center justify-between border-t border-black/8 pt-6 dark:border-white/10">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            この仕訳を削除します。
          </p>
          {/* 対象 ID を結び付けた削除アクションを渡す。 */}
          <DeleteEntryButton action={deleteEntryAction.bind(null, id)} />
        </div>
      </main>
    </div>
  );
}
