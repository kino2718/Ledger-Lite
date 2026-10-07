import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccounts, getJournalEntry } from "@/lib/journal/queries";
import { getAggregationStart, getSubAccountNames } from "@/lib/closing/queries";
import { LineColumn } from "../LineColumn";
import { yen } from "@/lib/format";

// 仕訳の内容を表示するだけのページ。仕訳一覧などからはまずここを開く。
// 開いた直後に書き換えられると「コピーするつもりが元の仕訳を編集してしまう」
// ことがあるため、編集は「編集」ボタンで編集ページへ移ってから行う。
const buttonClass =
  "inline-flex h-11 items-center rounded-full border border-black/12 px-5 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6";

export default async function JournalEntryPage({
  params,
}: {
  // この版では動的セグメントは Promise で渡るため await して取り出す。
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  // 数値以外の URL（/journal/abc など）は 404 に倒す。
  if (!Number.isInteger(id)) notFound();

  const session = await verifySession();
  const userId = Number(session.user.id);

  // 仕訳本体（所有スコープつき）と、名前を引くための全科目・全補助科目、
  // 集計開始日を並列で取得する。無効化済みの科目が混ざっていても表示できるよう、
  // フォーム用の選択肢ではなく全科目から名前を引く。
  const [entry, allAccounts, subAccounts, aggStart] = await Promise.all([
    getJournalEntry(userId, id),
    getAccounts(userId),
    getSubAccountNames(userId),
    getAggregationStart(userId),
  ]);
  // 他ユーザーの仕訳や存在しない ID は null → 404。
  if (!entry) notFound();

  // 繰越仕訳と、締め済みの年（集計開始日より前）の仕訳は編集・削除させない。
  // 「編集」ボタンを出さず案内を表示する（保存側でも同じ検証で弾いている）。
  const locked =
    entry.isOpening || (aggStart !== undefined && entry.entryDate < aggStart);

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
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            仕訳の内容
          </h1>
          <Link
            href="/journal"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 仕訳一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        {/* 編集できない理由と、解除の場所への案内。 */}
        {locked && (
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
        )}

        {/* 操作ボタン。コピーは締め済みの年の仕訳も雛形として使えるよう
            locked でも出す。繰越仕訳は年度締めが作るものなので対象外。 */}
        {!entry.isOpening && (
          <div className="flex flex-wrap justify-end gap-3">
            <Link href={`/journal/new?from=${id}`} className={buttonClass}>
              コピーして新規作成
            </Link>
            {!locked && (
              <Link href={`/journal/${id}/edit`} className={buttonClass}>
                編集
              </Link>
            )}
          </div>
        )}

        {/* 仕訳の内容（仕訳一覧と同じ見た目のカード）。 */}
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
      </main>
    </div>
  );
}
