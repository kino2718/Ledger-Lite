import Link from "next/link";
import { verifySession } from "@/lib/session";
import {
  getAccounts,
  getBalanceLines,
  getFirstEntryDate,
} from "@/lib/journal/queries";
import {
  carriesBalanceForward,
  computeAccountBalances,
  computeProfitLoss,
} from "@/lib/ledger/balance";
import { ACCOUNT_TYPE_LABEL } from "@/lib/ledger/types";
import {
  currentYear,
  resolveYearSelection,
  yearOf,
  yearOptions,
  yearRange,
} from "@/lib/ledger/period";
import { YearFilter } from "@/app/components/YearFilter";

// 金額を「¥1,234」形式に整形する。
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default async function BalanceSheetPage({
  searchParams,
}: {
  // この版ではクエリは Promise で渡るため await して取り出す。
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await verifySession();
  const userId = Number(session.user.id);

  // ?year= を解釈する（未指定・不正値は今年、"all" は現在時点）。
  const { year: yearParam } = await searchParams;
  const thisYear = currentYear();
  const selection = resolveYearSelection(yearParam, thisYear);

  // 貸借対照表は「時点」の表なので、選んだ年の年末までの累計を集計する。
  // 全期間を選んだときは全明細＝現在時点の残高になる。
  const [accounts, lines, firstEntryDate] = await Promise.all([
    getAccounts(userId),
    getBalanceLines(
      userId,
      selection === "all" ? undefined : { to: yearRange(selection).to },
    ),
    getFirstEntryDate(userId),
  ]);

  // 年セレクタの選択肢は「一番古い仕訳の年〜今年」（範囲外の選択年も含む）。
  const years = yearOptions(
    firstEntryDate !== null ? yearOf(firstEntryDate) : null,
    thisYear,
    selection,
  );

  // 左右の振り分けは科目の通常残高の向きで決める。
  // 借方側＝資産の部（事業主貸もここ）、貸方側＝負債・純資産の部（事業主借もここ）。
  // 青色申告決算書の貸借対照表と同じ並びになる。
  const normalSideByAccount = new Map(
    lines.map((line) => [line.accountId, line.normalSide]),
  );

  // 貸借対照表に載るのは残高を繰り越す科目（資産・負債・純資産）のみ。
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const rows = computeAccountBalances(lines)
    .filter((b) => carriesBalanceForward(b.accountType))
    .map((b) => {
      const account = accountById.get(b.accountId);
      return {
        ...b,
        code: account?.code ?? "",
        name: account?.name ?? "(不明な科目)",
        normalSide: normalSideByAccount.get(b.accountId),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const debitRows = rows.filter((r) => r.normalSide === "debit");
  const creditRows = rows.filter((r) => r.normalSide === "credit");
  const debitTotal = debitRows.reduce((sum, r) => sum + r.balance, 0);
  const creditTotal = creditRows.reduce((sum, r) => sum + r.balance, 0);

  // 純資産の部に入る損益。集計期間全体の収益 − 費用。
  // 年次繰越（締め）を実装するまでは、前年までの損益も含んだ累計になる。
  const pl = computeProfitLoss(lines);

  // 貸借の検算：資産側の合計＝負債・純資産側の合計＋損益。
  const rightTotal = creditTotal + pl.net;
  const balanced = debitTotal === rightTotal;

  const hasContent = rows.length > 0;

  // 科目リンクは選択中の年を引き継いで元帳を開く。
  const yearParamValue = selection === "all" ? "all" : String(selection);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            貸借対照表
          </h1>
          <Link
            href={`/ledger?year=${yearParamValue}`}
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 総勘定元帳
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {/* 年セレクタ。どの時点の貸借対照表を見るかを切り替える（既定は今年）。 */}
        <div className="mb-4">
          <YearFilter
            basePath="/ledger/balance-sheet"
            years={years}
            selection={selection}
          />
        </div>

        <p className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          貸借対照表（
          {selection === "all" ? "現在" : `${selection}年12月31日時点`}）
        </p>

        {!hasContent ? (
          <p className="rounded-2xl border border-black/8 bg-white py-12 text-center text-sm text-zinc-400 dark:border-white/10 dark:bg-zinc-950">
            {firstEntryDate !== null && selection !== "all"
              ? `${selection}年末までの残高はありません。`
              : "集計できる仕訳がまだありません。"}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            {/* 資産の部（借方側） */}
            <section className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
              <h2 className="border-b border-black/8 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
                資産の部
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {debitRows.map((row) => (
                    <AccountRow
                      key={row.accountId}
                      row={row}
                      yearParamValue={yearParamValue}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <TotalRow label="資産合計" amount={debitTotal} />
                </tfoot>
              </table>
            </section>

            {/* 負債・純資産の部（貸方側）。損益もここに入る。 */}
            <section className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
              <h2 className="border-b border-black/8 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
                負債・純資産の部
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {creditRows.map((row) => (
                    <AccountRow
                      key={row.accountId}
                      row={row}
                      yearParamValue={yearParamValue}
                    />
                  ))}
                  {/* 集計期間の損益。貸借対照表では純資産の一部になる。 */}
                  <tr className="border-b border-black/5 dark:border-white/5">
                    <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">
                      損益
                      <Link
                        href={`/ledger/profit-loss?year=${yearParamValue}`}
                        className="ml-2 text-xs text-zinc-400 transition-colors hover:text-black dark:hover:text-zinc-50"
                      >
                        損益計算書 →
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        pl.net >= 0
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {yen(pl.net)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <TotalRow label="負債・純資産合計" amount={rightTotal} />
                </tfoot>
              </table>
            </section>
          </div>
        )}

        {/* 貸借の検算。通常は一致するが、崩れていれば警告する。 */}
        {hasContent && !balanced && (
          <p className="mt-4 rounded-xl border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-400">
            資産合計と負債・純資産合計が一致しません。仕訳データを確認してください。
          </p>
        )}
      </main>
    </div>
  );
}

// 科目 1 行。科目名は選択中の年の元帳へのリンク。
function AccountRow({
  row,
  yearParamValue,
}: {
  row: {
    accountId: number;
    code: string;
    name: string;
    accountType: keyof typeof ACCOUNT_TYPE_LABEL;
    balance: number;
  };
  yearParamValue: string;
}) {
  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      <td className="px-4 py-2">
        <Link
          href={`/ledger/${row.accountId}?year=${yearParamValue}`}
          className="inline-flex items-baseline gap-2 text-zinc-800 transition-colors hover:text-black dark:text-zinc-200 dark:hover:text-zinc-50"
        >
          {row.code && (
            <span className="text-xs tabular-nums text-zinc-400">
              {row.code}
            </span>
          )}
          <span>{row.name}</span>
          <span className="text-xs text-zinc-400">
            {ACCOUNT_TYPE_LABEL[row.accountType]}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
        {yen(row.balance)}
      </td>
    </tr>
  );
}

// 部の合計行。
function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-t-2 border-black/12 dark:border-white/20">
      <td className="px-4 py-2 font-semibold text-zinc-900 dark:text-zinc-100">
        {label}
      </td>
      <td className="px-4 py-2 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {yen(amount)}
      </td>
    </tr>
  );
}
