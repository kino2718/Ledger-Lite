import { describe, expect, test } from "vitest";
import {
  computeAccountBalances,
  computeProfitLoss,
  normalBalanceSide,
  signedAmount,
} from "./balance";
import type { BalanceLine } from "./types";

describe("normalBalanceSide", () => {
  test("資産・費用は借方が通常残高", () => {
    expect(normalBalanceSide("asset")).toBe("debit");
    expect(normalBalanceSide("expense")).toBe("debit");
  });

  test("負債・純資産・収益は貸方が通常残高", () => {
    expect(normalBalanceSide("liability")).toBe("credit");
    expect(normalBalanceSide("equity")).toBe("credit");
    expect(normalBalanceSide("revenue")).toBe("credit");
  });
});

describe("signedAmount", () => {
  test("通常残高が借方の科目は借方がプラス、貸方がマイナス", () => {
    expect(
      signedAmount({ normalSide: "debit", side: "debit", amount: 1000 }),
    ).toBe(1000);
    expect(
      signedAmount({ normalSide: "debit", side: "credit", amount: 1000 }),
    ).toBe(-1000);
  });

  test("通常残高が貸方の科目は貸方がプラス、借方がマイナス", () => {
    expect(
      signedAmount({ normalSide: "credit", side: "credit", amount: 500 }),
    ).toBe(500);
    expect(
      signedAmount({ normalSide: "credit", side: "debit", amount: 500 }),
    ).toBe(-500);
  });

  test("評価勘定（事業主貸など）は normalSide=debit なら借方がプラス", () => {
    // 純資産だが通常残高は借方。借方計上が正に積み上がる。
    expect(
      signedAmount({ normalSide: "debit", side: "debit", amount: 10000 }),
    ).toBe(10000);
  });
});

describe("computeAccountBalances", () => {
  test("空配列なら空配列", () => {
    expect(computeAccountBalances([])).toEqual([]);
  });

  test("同一科目の借方・貸方を相殺して残高を出す", () => {
    const lines: BalanceLine[] = [
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "debit", amount: 1000 },
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "credit", amount: 300 },
    ];
    expect(computeAccountBalances(lines)).toEqual([
      { accountId: 1, accountType: "asset", balance: 700 },
    ]);
  });

  test("複数科目をそれぞれ集計し、初出順を保つ", () => {
    const lines: BalanceLine[] = [
      { accountId: 2, accountType: "revenue", normalSide: "credit", side: "credit", amount: 150000 },
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "debit", amount: 30000 },
      { accountId: 2, accountType: "revenue", normalSide: "credit", side: "debit", amount: 5000 },
    ];
    expect(computeAccountBalances(lines)).toEqual([
      { accountId: 2, accountType: "revenue", balance: 145000 },
      { accountId: 1, accountType: "asset", balance: 30000 },
    ]);
  });

  test("相殺して残高が 0 の科目も残す", () => {
    const lines: BalanceLine[] = [
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "debit", amount: 120000 },
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "credit", amount: 120000 },
    ];
    expect(computeAccountBalances(lines)).toEqual([
      { accountId: 1, accountType: "asset", balance: 0 },
    ]);
  });
});

describe("computeProfitLoss", () => {
  test("収益・費用・差引を計算する", () => {
    const lines: BalanceLine[] = [
      { accountId: 1, accountType: "revenue", normalSide: "credit", side: "credit", amount: 150000 },
      { accountId: 2, accountType: "expense", normalSide: "debit", side: "debit", amount: 93000 },
    ];
    expect(computeProfitLoss(lines)).toEqual({
      revenue: 150000,
      expense: 93000,
      net: 57000,
    });
  });

  test("資産・負債・純資産は損益に含めない", () => {
    const lines: BalanceLine[] = [
      { accountId: 1, accountType: "asset", normalSide: "debit", side: "debit", amount: 1000000 },
      { accountId: 2, accountType: "equity", normalSide: "credit", side: "credit", amount: 1000000 },
      { accountId: 3, accountType: "revenue", normalSide: "credit", side: "credit", amount: 30000 },
    ];
    expect(computeProfitLoss(lines)).toEqual({
      revenue: 30000,
      expense: 0,
      net: 30000,
    });
  });

  test("収益・費用の戻し（逆側）も符号付きで反映する", () => {
    const lines: BalanceLine[] = [
      { accountId: 1, accountType: "revenue", normalSide: "credit", side: "credit", amount: 30000 },
      { accountId: 1, accountType: "revenue", normalSide: "credit", side: "debit", amount: 5000 },
      { accountId: 2, accountType: "expense", normalSide: "debit", side: "debit", amount: 8000 },
    ];
    expect(computeProfitLoss(lines)).toEqual({
      revenue: 25000,
      expense: 8000,
      net: 17000,
    });
  });

  test("空配列ならすべて 0", () => {
    expect(computeProfitLoss([])).toEqual({ revenue: 0, expense: 0, net: 0 });
  });
});
