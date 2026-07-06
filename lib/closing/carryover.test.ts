import { describe, expect, test } from "vitest";
import {
  buildCarryoverLines,
  computeCarryoverBalances,
} from "./carryover";
import type { CarryoverBalance, CarryoverSourceLine } from "./carryover";

// テスト用の科目 ID。読みやすいように名前を付けておく。
const CASH = 1; // 現金（資産）
const BANK = 2; // 普通預金（資産）
const LOAN = 3; // 借入金（負債）
const DRAW = 30; // 事業主貸（純資産・借方残高）
const OWNER_LOAN = 31; // 事業主借（純資産）
const CAPITAL = 32; // 元入金（純資産）
const SALES = 40; // 売上高（収益）
const RENT = 50; // 地代家賃（費用）

// CarryoverBalance を短く書くためのヘルパー。
function balance(
  accountId: number,
  accountType: CarryoverBalance["accountType"],
  normalSide: CarryoverBalance["normalSide"],
  value: number,
  subAccountId: number | null = null,
): CarryoverBalance {
  return { accountId, subAccountId, accountType, normalSide, balance: value };
}

describe("computeCarryoverBalances", () => {
  test("科目ごとに残高を集計する（通常残高方向が正）", () => {
    const lines: CarryoverSourceLine[] = [
      { accountId: BANK, subAccountId: null, accountType: "asset", normalSide: "debit", side: "debit", amount: 1000 },
      { accountId: BANK, subAccountId: null, accountType: "asset", normalSide: "debit", side: "credit", amount: 300 },
      { accountId: SALES, subAccountId: null, accountType: "revenue", normalSide: "credit", side: "credit", amount: 1000 },
    ];
    expect(computeCarryoverBalances(lines)).toEqual([
      balance(BANK, "asset", "debit", 700),
      balance(SALES, "revenue", "credit", 1000),
    ]);
  });

  test("補助科目が違えば別の残高として集計する", () => {
    const lines: CarryoverSourceLine[] = [
      { accountId: BANK, subAccountId: 10, accountType: "asset", normalSide: "debit", side: "debit", amount: 500 },
      { accountId: BANK, subAccountId: 11, accountType: "asset", normalSide: "debit", side: "debit", amount: 200 },
      { accountId: BANK, subAccountId: null, accountType: "asset", normalSide: "debit", side: "debit", amount: 50 },
    ];
    expect(computeCarryoverBalances(lines)).toEqual([
      balance(BANK, "asset", "debit", 500, 10),
      balance(BANK, "asset", "debit", 200, 11),
      balance(BANK, "asset", "debit", 50, null),
    ]);
  });
});

describe("buildCarryoverLines", () => {
  test("資産は借方・負債と新元入金は貸方で繰り越す（元入金の振替式）", () => {
    // 元入金 1,000,000 で開業し、売上 200,000・家賃 46,000、
    // 生活費 150,000（事業主貸）・立替 3,000（事業主借）の年。
    const lines = buildCarryoverLines({
      balances: [
        balance(BANK, "asset", "debit", 1004000),
        balance(CAPITAL, "equity", "credit", 1000000),
        balance(DRAW, "equity", "debit", 150000),
        balance(OWNER_LOAN, "equity", "credit", 3000),
      ],
      netIncome: 151000, // 200,000 − 49,000
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: DRAW,
      ownerLoanAccountId: OWNER_LOAN,
    });

    // 新元入金 ＝ 1,000,000 ＋ 3,000 − 150,000 ＋ 151,000 ＝ 1,004,000
    expect(lines).toEqual([
      { accountId: BANK, subAccountId: null, side: "debit", amount: 1004000 },
      { accountId: CAPITAL, subAccountId: null, side: "credit", amount: 1004000 },
    ]);
  });

  test("負債は貸方のまま繰り越し、収益・費用と残高 0 の科目は行にしない", () => {
    const lines = buildCarryoverLines({
      balances: [
        balance(BANK, "asset", "debit", 130000),
        balance(CASH, "asset", "debit", 0), // 残高 0 → 省略
        balance(LOAN, "liability", "credit", 100000),
        balance(CAPITAL, "equity", "credit", 10000),
        balance(SALES, "revenue", "credit", 50000), // 収益 → 繰り越さない
        balance(RENT, "expense", "debit", 30000), // 費用 → 繰り越さない
      ],
      netIncome: 20000, // 50,000 − 30,000
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: DRAW,
      ownerLoanAccountId: OWNER_LOAN,
    });

    expect(lines).toEqual([
      { accountId: BANK, subAccountId: null, side: "debit", amount: 130000 },
      { accountId: LOAN, subAccountId: null, side: "credit", amount: 100000 },
      { accountId: CAPITAL, subAccountId: null, side: "credit", amount: 30000 },
    ]);
  });

  test("補助科目ごとの残高はそのまま補助科目つきで繰り越す", () => {
    const lines = buildCarryoverLines({
      balances: [
        balance(BANK, "asset", "debit", 500, 10),
        balance(BANK, "asset", "debit", 200, 11),
        balance(CAPITAL, "equity", "credit", 700),
      ],
      netIncome: 0,
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: null,
      ownerLoanAccountId: null,
    });

    expect(lines).toEqual([
      { accountId: BANK, subAccountId: 10, side: "debit", amount: 500 },
      { accountId: BANK, subAccountId: 11, side: "debit", amount: 200 },
      { accountId: CAPITAL, subAccountId: null, side: "credit", amount: 700 },
    ]);
  });

  test("逆残高（マイナス）の科目は反対側に繰り越す", () => {
    // 普通預金がマイナス 5,000（貸方残高）になっている年。
    const lines = buildCarryoverLines({
      balances: [
        balance(CASH, "asset", "debit", 20000),
        balance(BANK, "asset", "debit", -5000),
        balance(CAPITAL, "equity", "credit", 15000),
      ],
      netIncome: 0,
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: null,
      ownerLoanAccountId: null,
    });

    expect(lines).toEqual([
      { accountId: CASH, subAccountId: null, side: "debit", amount: 20000 },
      { accountId: BANK, subAccountId: null, side: "credit", amount: 5000 },
      { accountId: CAPITAL, subAccountId: null, side: "credit", amount: 15000 },
    ]);
  });

  test("損失の年は元入金が減り、マイナスになれば借方に繰り越す", () => {
    // 元入金 10,000 に対して損失 25,000 → 新元入金は −15,000（借方）。
    const lines = buildCarryoverLines({
      balances: [
        balance(LOAN, "liability", "credit", 15000),
        balance(CAPITAL, "equity", "credit", 10000),
      ],
      netIncome: -25000,
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: null,
      ownerLoanAccountId: null,
    });

    expect(lines).toEqual([
      { accountId: CAPITAL, subAccountId: null, side: "debit", amount: 15000 },
      { accountId: LOAN, subAccountId: null, side: "credit", amount: 15000 },
    ]);
  });

  test("元入金以外の純資産の科目は残高のまま繰り越す", () => {
    // ユーザーが独自に作った純資産の科目は畳み込まず、そのまま運ぶ。
    const OTHER_EQUITY = 33;
    const lines = buildCarryoverLines({
      balances: [
        balance(BANK, "asset", "debit", 30000),
        balance(OTHER_EQUITY, "equity", "credit", 20000),
        balance(CAPITAL, "equity", "credit", 10000),
      ],
      netIncome: 0,
      capitalAccountId: CAPITAL,
      ownerDrawAccountId: null,
      ownerLoanAccountId: null,
    });

    expect(lines).toEqual([
      { accountId: BANK, subAccountId: null, side: "debit", amount: 30000 },
      { accountId: OTHER_EQUITY, subAccountId: null, side: "credit", amount: 20000 },
      { accountId: CAPITAL, subAccountId: null, side: "credit", amount: 10000 },
    ]);
  });

  test("繰り越す残高が何もなければ空配列", () => {
    expect(
      buildCarryoverLines({
        balances: [balance(SALES, "revenue", "credit", 1000)],
        netIncome: 1000 - 1000, // 収益と費用が同額で損益 0 とみなす
        capitalAccountId: CAPITAL,
        ownerDrawAccountId: null,
        ownerLoanAccountId: null,
      }),
    ).toEqual([]);
  });

  test("入力が矛盾していて貸借が合わない場合は例外", () => {
    // 資産 100 に見合う負債・純資産・損益が無い＝帳簿データの不整合。
    expect(() =>
      buildCarryoverLines({
        balances: [balance(CASH, "asset", "debit", 100)],
        netIncome: 0,
        capitalAccountId: CAPITAL,
        ownerDrawAccountId: null,
        ownerLoanAccountId: null,
      }),
    ).toThrow(/貸借が一致しません/);
  });
});
