import Link from "next/link";
import type { YearSelection } from "@/lib/ledger/period";

// 年セレクタ（チップ式）。リンクで ?year= を切り替えるだけの Server Component。
// ?year=YYYY でその年、?year=all で全期間。仕訳一覧・元帳・試算表などで共用する。
export function YearFilter({
  basePath,
  years,
  selection,
}: {
  // クエリを付けるページのパス（例: "/journal"）。
  basePath: string;
  // 選択肢に並べる年（新しい順を想定）。
  years: number[];
  selection: YearSelection;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {years.map((year) => (
        <Chip
          key={year}
          href={`${basePath}?year=${year}`}
          active={selection === year}
          label={`${year}年`}
        />
      ))}
      <Chip
        href={`${basePath}?year=all`}
        active={selection === "all"}
        label="全期間"
      />
    </div>
  );
}

// 絞り込みチップ。選択中は反転色で示す（補助元帳のチップと同じ見た目）。
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
