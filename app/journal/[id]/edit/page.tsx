import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountOptions, getJournalEntry } from "@/lib/journal/queries";
import { JournalForm } from "../../JournalForm";
import type { Pair } from "../../JournalForm";
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

  // 既存明細を借方・貸方それぞれ上から詰めて組にする（科目を左右で見比べやすい）。
  // 組の対応は表示上のものだけで、保存時に lineNo を振り直すため意味は変わらない。
  type LineDetail = (typeof entry.lines)[number];
  const emptySide = { accountId: "", subAccountId: "", amount: "" };
  const toSideInput = (line: LineDetail) => ({
    accountId: String(line.accountId),
    subAccountId: line.subAccountId === null ? "" : String(line.subAccountId),
    amount: String(line.amount),
  });
  const debits = entry.lines.filter((line) => line.side === "debit");
  const credits = entry.lines.filter((line) => line.side === "credit");
  // 借方・貸方で件数が違っても、多いほうに合わせて行数を確保する。
  const rowCount = Math.max(debits.length, credits.length);
  const initialPairs: Pair[] = Array.from({ length: rowCount }, (_, i) => ({
    debit: debits[i] ? toSideInput(debits[i]) : { ...emptySide },
    credit: credits[i] ? toSideInput(credits[i]) : { ...emptySide },
  }));

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
