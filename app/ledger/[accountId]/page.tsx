import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import {
  getFirstEntryDate,
  getLedgerAccount,
  getLedgerLines,
  getOpeningBalance,
} from "@/lib/journal/queries";
import { buildLedgerRows } from "@/lib/ledger/ledger";
import { carriesBalanceForward } from "@/lib/ledger/balance";
import { ACCOUNT_TYPE_LABEL } from "@/lib/ledger/types";
import {
  allPeriodLabel,
  currentYear,
  resolveYearSelection,
  yearOf,
  yearOptions,
  yearRange,
} from "@/lib/ledger/period";
import { YearFilter } from "@/app/components/YearFilter";
import { getAggregationStart } from "@/lib/closing/queries";
import { yen } from "@/lib/format";

// 元帳テーブルの列幅。ヘッダーと各行で同じグリッドを使って桁を揃える。
const GRID_COLS =
  "grid-cols-[6rem_minmax(8rem,1fr)_6rem_7rem_7rem_8rem]";

export default async function LedgerPage({
  params,
  searchParams,
}: {
  // この版では動的セグメント・クエリは Promise で渡るため await して取り出す。
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ sub?: string; year?: string }>;
}) {
  const { accountId: accountIdParam } = await params;
  const accountId = Number(accountIdParam);
  // 数値以外の URL（/ledger/abc など）は 404 に倒す。
  if (!Number.isInteger(accountId)) notFound();

  const session = await verifySession();
  const userId = Number(session.user.id);

  // 対象科目（所有スコープつき・補助科目つき）を取得。無ければ 404。
  const account = await getLedgerAccount(userId, accountId);
  if (!account) notFound();

  // ?sub= は対象科目に属する補助科目のときだけ有効にする（不正値は無視＝全件）。
  const { sub, year: yearParam } = await searchParams;
  const subId = sub !== undefined ? Number(sub) : undefined;
  const activeSub =
    subId !== undefined
      ? account.subAccounts.find((s) => s.id === subId)
      : undefined;

  // ?year= を解釈する（未指定・不正値は今年、"all" は全期間）。
  const thisYear = currentYear();
  const selection = resolveYearSelection(yearParam, thisYear);

  // 締め済みの年があれば、集計は繰越仕訳の日付から始める（二重計上防止）。
  // 繰越仕訳自体は普通の仕訳として明細行に表示される。
  // allStart は最新の締めに基づく開始日で、「全期間」チップの表記に使う。
  const [aggStart, allStart] = await Promise.all([
    getAggregationStart(userId, selection === "all" ? undefined : selection),
    getAggregationStart(userId),
  ]);

  // 年で絞ったときは、年初より前の残高を「前期繰越」として先頭に置く。
  // ただし収益・費用は毎年ゼロから始まるため前期繰越を持たない。
  // 前年を締めた年は集計開始＝年初なので 0 になり、代わりに繰越仕訳の行が出る。
  const carriesForward = carriesBalanceForward(account.accountType);
  const openingBalance =
    selection === "all" || !carriesForward
      ? 0
      : await getOpeningBalance({
          userId,
          accountId: account.id,
          normalSide: account.normalSide,
          before: `${selection}-01-01`,
          from: aggStart,
          subAccountId: activeSub?.id,
        });

  // 明細を取得し、純粋関数で残高を積み上げて表示用の行に変換する。
  const lines = await getLedgerLines(
    userId,
    accountId,
    activeSub?.id,
    selection === "all"
      ? aggStart !== undefined
        ? { from: aggStart }
        : undefined
      : yearRange(selection),
  );
  const rows = buildLedgerRows({
    lines,
    // 残高の向きは科目固有の通常残高（事業主貸などの評価勘定も正しく扱える）。
    normalSide: account.normalSide,
    openingBalance,
  });
  const closingBalance =
    rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const firstEntryDate = await getFirstEntryDate(userId);
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );

  // 前期繰越行は年で絞ったとき、繰り越す科目に残高がある場合だけ出す
  // （前年を締めた年は繰越仕訳の行が出るので、この行は不要になる）。
  const showOpeningRow =
    selection !== "all" && carriesForward && openingBalance !== 0;
  const hasContent = rows.length > 0 || showOpeningRow;

  // 補助科目チップのリンク先。選択中の年を維持したまま補助科目を切り替える。
  const yearParamValue = selection === "all" ? "all" : String(selection);
  const subHref = (subAccountId?: number) => {
    const params = new URLSearchParams({ year: yearParamValue });
    if (subAccountId !== undefined) params.set("sub", String(subAccountId));
    return `/ledger/${account.id}?${params.toString()}`;
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            {account.name}
            {activeSub && (
              <span className="ml-1 text-zinc-400">／ {activeSub.name}</span>
            )}
          </h1>
          <Link
            href={`/ledger?year=${yearParamValue}`}
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 科目一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {/* 科目の見出し（分類・現在残高） */}
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {ACCOUNT_TYPE_LABEL[account.accountType]}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            残高{" "}
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {yen(closingBalance)}
            </span>
          </p>
        </div>

        {/* 年セレクタ。補助科目の選択は維持したまま年を切り替える。 */}
        <div className="mb-4">
          <YearFilter
            basePath={`/ledger/${account.id}`}
            years={years}
            selection={selection}
            allLabel={allPeriodLabel(allStart)}
            extraParams={activeSub ? { sub: String(activeSub.id) } : undefined}
          />
        </div>

        {/* 補助科目の絞り込みチップ（補助科目を持つ科目のみ） */}
        {account.subAccounts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip href={subHref()} active={!activeSub} label="すべて" />
            {account.subAccounts.map((s) => (
              <Chip
                key={s.id}
                href={subHref(s.id)}
                active={activeSub?.id === s.id}
                label={s.name}
              />
            ))}
          </div>
        )}

        {!hasContent ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {selection === "all"
              ? "この科目の仕訳はまだありません。"
              : `${selection}年の仕訳はありません。`}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <div className="min-w-2xl">
              {/* ヘッダー行 */}
              <div
                className={`grid ${GRID_COLS} gap-2 border-b border-black/8 px-4 py-2 text-xs font-medium text-zinc-400 dark:border-white/10`}
              >
                <span>日付</span>
                <span>摘要</span>
                <span>相手科目</span>
                <span className="text-right">借方</span>
                <span className="text-right">貸方</span>
                <span className="text-right">残高</span>
              </div>
              {/* 前期繰越行（年で絞ったときのみ）。仕訳ではないのでリンクにしない。 */}
              {showOpeningRow && (
                <div
                  className={`grid ${GRID_COLS} gap-2 border-b border-black/5 px-4 py-2 text-sm last:border-0 dark:border-white/5`}
                >
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {selection}-01-01
                  </span>
                  <span className="text-zinc-800 dark:text-zinc-200">
                    前期繰越
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">—</span>
                  <span />
                  <span />
                  <span className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(openingBalance)}
                  </span>
                </div>
              )}
              {/* 各行は元の仕訳の編集ページへのリンク */}
              {rows.map((row, i) => (
                <Link
                  key={`${row.entryId}-${i}`}
                  href={`/journal/${row.entryId}/edit`}
                  className={`grid ${GRID_COLS} gap-2 border-b border-black/5 px-4 py-2 text-sm transition-colors last:border-0 hover:bg-black/4 dark:border-white/5 dark:hover:bg-white/6`}
                >
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {row.entryDate}
                  </span>
                  <span className="truncate text-zinc-800 dark:text-zinc-200">
                    {row.description ?? "（摘要なし）"}
                  </span>
                  <span className="truncate text-zinc-600 dark:text-zinc-400">
                    {row.counterLabel || "—"}
                  </span>
                  <span className="text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {row.debit ? yen(row.debit) : ""}
                  </span>
                  <span className="text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                    {row.credit ? yen(row.credit) : ""}
                  </span>
                  <span className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {yen(row.balance)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// 補助科目の絞り込みチップ。選択中は反転色で示す。
function Chip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-black px-3 py-1 text-xs font-medium text-white dark:bg-zinc-50 dark:text-black"
          : "rounded-full border border-black/12 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6"
      }
    >
      {label}
    </Link>
  );
}
