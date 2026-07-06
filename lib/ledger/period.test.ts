import { describe, expect, test } from "vitest";
import {
  allPeriodLabel,
  currentYear,
  parseYearParam,
  resolveYearSelection,
  yearOf,
  yearOptions,
  yearRange,
} from "./period";

describe("currentYear", () => {
  test("渡した日付の年を返す", () => {
    expect(currentYear(new Date(2026, 6, 4))).toBe(2026);
    expect(currentYear(new Date(2025, 11, 31))).toBe(2025);
  });
});

describe("yearRange", () => {
  test("その年の 1/1〜12/31 の範囲を返す", () => {
    expect(yearRange(2026)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});

describe("yearOf", () => {
  test("取引日から年を取り出す", () => {
    expect(yearOf("2026-07-04")).toBe(2026);
    expect(yearOf("1999-01-01")).toBe(1999);
  });
});

describe("parseYearParam", () => {
  test("4 桁の数字は年として読む", () => {
    expect(parseYearParam("2026")).toBe(2026);
    expect(parseYearParam("1999")).toBe(1999);
  });

  test("未指定・4 桁の数字以外は null", () => {
    expect(parseYearParam(undefined)).toBeNull();
    expect(parseYearParam("")).toBeNull();
    expect(parseYearParam("all")).toBeNull();
    expect(parseYearParam("26")).toBeNull();
    expect(parseYearParam("20260")).toBeNull();
    expect(parseYearParam("abcd")).toBeNull();
    expect(parseYearParam("2026-01")).toBeNull();
  });
});

describe("resolveYearSelection", () => {
  test("\"all\" は全期間", () => {
    expect(resolveYearSelection("all", 2026)).toBe("all");
  });

  test("年として読める値はその年", () => {
    expect(resolveYearSelection("2025", 2026)).toBe(2025);
  });

  test("未指定・不正値は今年に倒す", () => {
    expect(resolveYearSelection(undefined, 2026)).toBe(2026);
    expect(resolveYearSelection("abc", 2026)).toBe(2026);
  });
});

describe("allPeriodLabel", () => {
  test("集計開始日が無ければ「全期間」", () => {
    expect(allPeriodLabel(undefined)).toBe("全期間");
  });

  test("集計開始日があれば「{開始年}年〜」", () => {
    expect(allPeriodLabel("2025-01-01")).toBe("2025年〜");
    expect(allPeriodLabel("2027-01-01")).toBe("2027年〜");
  });
});

describe("yearOptions", () => {
  test("最初の仕訳の年から今年までを新しい順に並べる", () => {
    expect(yearOptions(2024, 2026)).toEqual([2026, 2025, 2024]);
  });

  test("最初の仕訳が今年なら今年だけ", () => {
    expect(yearOptions(2026, 2026)).toEqual([2026]);
  });

  test("仕訳が無い（null）なら今年だけ", () => {
    expect(yearOptions(null, 2026)).toEqual([2026]);
  });

  test("最初の仕訳が未来の年でも今年だけ（範囲が壊れない）", () => {
    expect(yearOptions(2027, 2026)).toEqual([2026]);
  });

  test("選択中の年が範囲外なら選択肢に足して新しい順を保つ", () => {
    expect(yearOptions(2025, 2026, 2020)).toEqual([2026, 2025, 2020]);
    expect(yearOptions(2025, 2026, 2030)).toEqual([2030, 2026, 2025]);
  });

  test("選択中の年が範囲内・全期間なら一覧はそのまま", () => {
    expect(yearOptions(2025, 2026, 2025)).toEqual([2026, 2025]);
    expect(yearOptions(2025, 2026, "all")).toEqual([2026, 2025]);
  });
});
