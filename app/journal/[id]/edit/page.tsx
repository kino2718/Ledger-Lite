import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import {
  getAccountOptions,
  getAccounts,
  getJournalEntry,
} from "@/lib/journal/queries";
import { getAggregationStart, getSubAccountNames } from "@/lib/closing/queries";
import { JournalForm } from "../../JournalForm";
import { DeleteEntryButton } from "../../DeleteEntryButton";
import { LineColumn } from "../../LineColumn";
import { linesToPairs } from "@/lib/journal/form";
import { deleteEntryAction, updateEntryAction } from "./actions";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

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
  // フォームの代わりに内容の表示と案内を出す（保存側でも同じ検証で弾いている）。
  const locked =
    entry.isOpening || (aggStart !== undefined && entry.entryDate < aggStart);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            {locked ? "仕訳の内容" : "仕訳の編集"}
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
        {locked ? (
          <LockedEntryView userId={userId} entry={entry} />
        ) : (
          <>
            <JournalForm
              accounts={accounts}
              // 対象 ID を結び付けた更新アクションを渡す。
              action={updateEntryAction.bind(null, id)}
              initialEntryDate={entry.entryDate}
              initialDescription={entry.description ?? undefined}
              initialPairs={linesToPairs(entry.lines)}
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
          </>
        )}
      </main>
    </div>
  );
}

// 編集できない仕訳（繰越仕訳・締め済みの年）の読み取り専用表示。
async function LockedEntryView({
  userId,
  entry,
}: {
  userId: number;
  entry: NonNullable<Awaited<ReturnType<typeof getJournalEntry>>>;
}) {
  // 無効化済みの科目・補助科目が混ざっていても表示できるよう、
  // フォーム用の選択肢ではなく全科目から名前を引く。
  const [allAccounts, subAccounts] = await Promise.all([
    getAccounts(userId),
    getSubAccountNames(userId),
  ]);
  const accountNameById = new Map(allAccounts.map((a) => [a.id, a.name]));
  const subNameById = new Map(subAccounts.map((s) => [s.id, s.name]));

  const viewLines = entry.lines.map((line) => ({
    side: line.side,
    amount: line.amount,
    accountName: accountNameById.get(line.accountId) ?? "(不明な科目)",
    subAccountName:
      line.subAccountId !== null
        ? (subNameById.get(line.subAccountId) ?? null)
        : null,
  }));
  const debits = viewLines.filter((line) => line.side === "debit");
  const credits = viewLines.filter((line) => line.side === "credit");
  const total = debits.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* 編集できない理由と、解除の場所への案内。 */}
      <p className="rounded-xl border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-400">
        {entry.isOpening
          ? "この仕訳は年度締めで作られた繰越仕訳のため、編集・削除できません。取り消すには決算ページで締めを解除してください。"
          : "締め済みの年の仕訳のため、編集・削除できません。変更するには決算ページで締めを解除してください。"}
        <Link
          href="/closing"
          className="ml-2 font-medium underline underline-offset-2"
        >
          決算ページへ
        </Link>
      </p>

      {/* 仕訳の内容（仕訳一覧と同じ見た目の読み取り専用カード）。 */}
      <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-zinc-800 dark:text-zinc-200">
              {entry.description ?? "（摘要なし）"}
            </p>
            <p className="text-xs text-zinc-400">{entry.entryDate}</p>
          </div>
          <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {yen(total)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <LineColumn label="借方" lines={debits} />
          <LineColumn label="貸方" lines={credits} />
        </div>
      </div>
    </div>
  );
}
