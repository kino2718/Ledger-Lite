import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getLedgerAccount, getLedgerLines } from "@/lib/journal/queries";
import { buildLedgerRows } from "@/lib/ledger/ledger";
import type { AccountType } from "@/lib/ledger/types";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 科目分類の日本語ラベル。
const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
};

// 元帳テーブルの列幅。ヘッダーと各行で同じグリッドを使って桁を揃える。
const GRID_COLS =
  "grid-cols-[6rem_minmax(8rem,1fr)_6rem_7rem_7rem_8rem]";

export default async function LedgerPage({
  params,
  searchParams,
}: {
  // この版では動的セグメント・クエリは Promise で渡るため await して取り出す。
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ sub?: string }>;
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
  const { sub } = await searchParams;
  const subId = sub !== undefined ? Number(sub) : undefined;
  const activeSub =
    subId !== undefined
      ? account.subAccounts.find((s) => s.id === subId)
      : undefined;

  // 明細を取得し、純粋関数で残高を積み上げて表示用の行に変換する。
  const lines = await getLedgerLines(userId, accountId, activeSub?.id);
  const rows = buildLedgerRows({
    lines,
    // 残高の向きは科目固有の通常残高（事業主貸などの評価勘定も正しく扱える）。
    normalSide: account.normalSide,
    openingBalance: 0,
  });
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  // 補助科目チップのリンク先（全件＝クエリなし、各補助科目＝?sub=）。
  const allHref = `/ledger/${account.id}`;

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
            href="/ledger"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 科目一覧
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {/* 科目の見出し（コード・分類・現在残高） */}
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {account.code && (
              <span className="tabular-nums">{account.code}・</span>
            )}
            {ACCOUNT_TYPE_LABEL[account.accountType]}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            残高{" "}
            <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {yen(closingBalance)}
            </span>
          </p>
        </div>

        {/* 補助科目の絞り込みチップ（補助科目を持つ科目のみ） */}
        {account.subAccounts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Chip href={allHref} active={!activeSub} label="すべて" />
            {account.subAccounts.map((s) => (
              <Chip
                key={s.id}
                href={`/ledger/${account.id}?sub=${s.id}`}
                active={activeSub?.id === s.id}
                label={s.name}
              />
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            この科目の仕訳はまだありません。
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
