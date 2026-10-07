import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountOptions, getJournalEntry } from "@/lib/journal/queries";
import { getAggregationStart } from "@/lib/closing/queries";
import { JournalForm } from "../../JournalForm";
import { DeleteButton } from "@/app/components/DeleteButton";
import { linesToPairs } from "@/lib/journal/form";
import { deleteEntryAction, updateEntryAction } from "./actions";

// 仕訳の編集ページ。内容を表示するページ（/journal/[id]）の「編集」ボタンから開く。
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

  // 仕訳本体（所有スコープつき）と科目の選択肢、集計開始日を並列で取得する。
  const [entry, accounts, aggStart] = await Promise.all([
    getJournalEntry(userId, id),
    getAccountOptions(userId),
    getAggregationStart(userId),
  ]);
  // 他ユーザーの仕訳や存在しない ID は null → 404。
  if (!entry) notFound();

  // 繰越仕訳と、締め済みの年（集計開始日より前）の仕訳は編集・削除させない。
  // URL を直接開かれた場合も、案内を出す表示ページへ戻す
  // （保存側でも同じ検証で弾いている）。
  const locked =
    entry.isOpening || (aggStart !== undefined && entry.entryDate < aggStart);
  if (locked) redirect(`/journal/${id}`);

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
          initialPairs={linesToPairs(entry.lines)}
          submitLabel="更新"
          // キャンセルしたら内容を表示するページへ戻る。
          cancelHref={`/journal/${id}`}
        />

        {/* 削除はフォームと独立した操作なので、区切って下部に配置する。
            うっかり押さないよう、表示ページではなく編集ページにだけ置く。 */}
        <div className="mt-8 flex items-center justify-between border-t border-black/8 pt-6 dark:border-white/10">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            この仕訳を削除します。
          </p>
          {/* 対象 ID を結び付けた削除アクションを渡す。 */}
          <DeleteButton
            action={deleteEntryAction.bind(null, id)}
            confirmMessage="この仕訳を削除します。元に戻せません。よろしいですか？"
          />
        </div>
      </main>
    </div>
  );
}
