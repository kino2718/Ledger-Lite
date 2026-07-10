import Link from "next/link";
import { verifySession } from "@/lib/session";
import { getAccounts, getFirstEntryDate } from "@/lib/journal/queries";
import { previewCloseYear } from "@/lib/closing/manage";
import { getSubAccountNames, getYearClosings } from "@/lib/closing/queries";
import type { CarryoverLine } from "@/lib/closing/carryover";
import { currentYear, yearOf } from "@/lib/ledger/period";
import { closeYearAction, reopenYearAction } from "./actions";
import { ClosingButton } from "./ClosingButton";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 締めた日時の表示用（例: 2026/07/07 09:30）。
const formatDateTime = (d: Date) =>
  d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// 繰越仕訳プレビューの表示用 1 行。
type PreviewRow = {
  name: string;
  subName: string | null;
  amount: number;
};

export default async function ClosingPage() {
  const session = await verifySession();
  const userId = Number(session.user.id);

  const [firstEntryDate, closings, accounts, subAccounts] = await Promise.all([
    getFirstEntryDate(userId),
    getYearClosings(userId),
    getAccounts(userId),
    getSubAccountNames(userId),
  ]);

  const thisYear = currentYear();
  const firstYear = firstEntryDate !== null ? yearOf(firstEntryDate) : null;
  // 締められるのは終わった年だけ。今年は年が終わるまで締められない。
  const lastClosableYear = thisYear - 1;

  // 一覧に並べる年（帳簿の最初の年〜昨年、新しい順）。
  const years: number[] = [];
  if (firstYear !== null) {
    for (let year = lastClosableYear; year >= firstYear; year--) {
      years.push(year);
    }
  }

  // 締めは古い年から順・解除は新しい年から順にしかできない。
  const closingByYear = new Map(closings.map((c) => [c.year, c]));
  const latestClosedYear = closings.length > 0 ? closings[0].year : null;
  const nextYearToClose = (() => {
    if (firstYear === null) return null;
    const candidate =
      latestClosedYear !== null ? latestClosedYear + 1 : firstYear;
    return candidate <= lastClosableYear ? candidate : null;
  })();

  // 次に締める年のプレビュー。実際の締めと同じ検証・同じ計算を通すので、
  // ここに出る内容がそのまま繰越仕訳になる。
  const previewed =
    nextYearToClose !== null
      ? await previewCloseYear(userId, nextYearToClose)
      : null;

  // プレビューの明細に科目名・補助科目名を付ける。
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const subNameById = new Map(subAccounts.map((s) => [s.id, s.name]));
  const toPreviewRows = (lines: CarryoverLine[]): PreviewRow[] =>
    lines.map((line) => {
      const account = accountById.get(line.accountId);
      return {
        name: account?.name ?? "(不明な科目)",
        subName:
          line.subAccountId !== null
            ? (subNameById.get(line.subAccountId) ?? null)
            : null,
        amount: line.amount,
      };
    });

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            決算
          </h1>
          <Link
            href="/"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← ダッシュボード
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        {/* 次の締め。プレビューと実行ボタンを出す。 */}
        <section>
          <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            次の締め
          </h2>
          {firstYear === null ? (
            <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
              仕訳がまだ無いため、締められる年はありません。
            </p>
          ) : years.length === 0 ? (
            <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
              まだ締められる年はありません。{thisYear}
              年の帳簿は、年が終わってから締められます。
            </p>
          ) : nextYearToClose === null ? (
            <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
              {lastClosableYear}年まですべて締め済みです。
            </p>
          ) : (
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-black dark:text-zinc-50">
                  {nextYearToClose}年を締める
                </h3>
                {/* 間違えても締め解除で元に戻るので、確認ダイアログは出さない。 */}
                {previewed?.ok && (
                  <ClosingButton
                    action={closeYearAction.bind(null, nextYearToClose)}
                    label="この年を締める"
                    pendingLabel="締め処理中..."
                  />
                )}
              </div>

              {!previewed?.ok ? (
                // 元入金が無い場合など。原因を案内し、ボタンは出さない。
                <ul className="flex flex-col gap-1 rounded-lg border border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-400">
                  {(previewed?.errors ?? ["プレビューを表示できません。"]).map(
                    (error) => (
                      <li key={error}>{error}</li>
                    ),
                  )}
                </ul>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* 締める年の損益。繰越では新しい元入金に含まれる。 */}
                  <div className="flex items-baseline justify-between rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {nextYearToClose}年の損益
                    </span>
                    <span
                      className={`text-base font-semibold tabular-nums ${
                        previewed.preview.netIncome >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {yen(previewed.preview.netIncome)}
                    </span>
                  </div>

                  {/* 繰越仕訳のプレビュー。締めるとこの内容の仕訳が作られる。 */}
                  <div>
                    <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
                      繰越仕訳のプレビュー（{nextYearToClose + 1}
                      年1月1日付・前期繰越）
                    </p>
                    {previewed.preview.lines.length === 0 ? (
                      <p className="rounded-lg border border-black/8 px-4 py-3 text-sm text-zinc-400 dark:border-white/10">
                        繰り越す残高はありません（明細のない繰越仕訳で締めます）。
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                        <PreviewColumn
                          label="借方"
                          rows={toPreviewRows(
                            previewed.preview.lines.filter(
                              (line) => line.side === "debit",
                            ),
                          )}
                        />
                        <PreviewColumn
                          label="貸方"
                          rows={toPreviewRows(
                            previewed.preview.lines.filter(
                              (line) => line.side === "credit",
                            ),
                          )}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 年ごとの状態一覧 */}
        {years.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              年ごとの状態
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
              {years.map((year) => {
                const closing = closingByYear.get(year);
                return (
                  <li
                    key={year}
                    className="flex flex-col gap-2 border-b border-black/5 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-white/5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {year}年
                      </span>
                      {closing ? (
                        <>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            締め済み
                          </span>
                          <span className="text-xs text-zinc-400">
                            締めた日時: {formatDateTime(closing.createdAt)}
                          </span>
                          <Link
                            href={`/journal/${closing.openingEntryId}/edit`}
                            className="text-xs text-zinc-500 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                          >
                            繰越仕訳 →
                          </Link>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                            未締め
                          </span>
                          {year === nextYearToClose && (
                            <span className="text-xs text-zinc-400">
                              次に締める年
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {/* 繰越の連鎖が崩れないよう、解除できるのは最新の締め年だけ。 */}
                    {closing && year === latestClosedYear && (
                      <ClosingButton
                        action={reopenYearAction.bind(null, year)}
                        label="締め解除"
                        pendingLabel="解除中..."
                        confirmMessage={`${year}年の締めを解除します。繰越仕訳（前期繰越）は削除されます。よろしいですか？`}
                        danger
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

// 繰越仕訳プレビューの借方・貸方 1 列分。
function PreviewColumn({ label, rows }: { label: string; rows: PreviewRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="overflow-hidden rounded-lg border border-black/8 dark:border-white/10">
      <p className="border-b border-black/8 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
        {label}
      </p>
      {rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-zinc-300 dark:text-zinc-600">—</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-black/5 dark:border-white/5"
              >
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-baseline gap-2 text-zinc-800 dark:text-zinc-200">
                    <span>
                      {row.name}
                      {row.subName && (
                        <span className="ml-1 text-xs text-zinc-400">
                          / {row.subName}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                  {yen(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                合計
              </td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {yen(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
