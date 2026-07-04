// 会計期間（年度）まわりの純粋関数。DB には依存しない。
// 個人事業を対象とするため、会計期間は暦年（1/1〜12/31）固定。

// 取引日（YYYY-MM-DD 文字列）の範囲指定。辞書順＝日付順なので文字列比較で足りる。
export type DateRange = { from?: string; to?: string };

// 年セレクタの選択状態。数値はその年、"all" は全期間。
export type YearSelection = number | "all";

/** 今年の年数を返す。テストでは today を差し替えて固定する。 */
export function currentYear(today: Date = new Date()): number {
  return today.getFullYear();
}

/** 年からその年 1/1〜12/31 の範囲を作る。 */
export function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** 取引日（YYYY-MM-DD）から年を取り出す。 */
export function yearOf(entryDate: string): number {
  return Number(entryDate.slice(0, 4));
}

/** URL の ?year= の値を年として解釈する。4 桁の数字以外（未指定・不正値）は null。 */
export function parseYearParam(value: string | undefined): number | null {
  if (value === undefined || !/^\d{4}$/.test(value)) return null;
  return Number(value);
}

/**
 * ?year= の値から表示対象を決める。"all" は全期間、
 * 年として読めない値（未指定・不正値）は今年に倒す。
 */
export function resolveYearSelection(
  value: string | undefined,
  thisYear: number,
): YearSelection {
  if (value === "all") return "all";
  return parseYearParam(value) ?? thisYear;
}

/**
 * 年セレクタに並べる年の一覧を新しい順で作る（最初の仕訳の年〜今年）。
 * firstYear が null（仕訳なし）や今年より後のときは今年だけを返す。
 */
export function yearOptions(
  firstYear: number | null,
  thisYear: number,
): number[] {
  const start = firstYear === null ? thisYear : Math.min(firstYear, thisYear);
  const years: number[] = [];
  for (let year = thisYear; year >= start; year--) {
    years.push(year);
  }
  return years;
}
