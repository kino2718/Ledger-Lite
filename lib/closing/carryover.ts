// 年度締めの繰越仕訳を計算する純粋関数。DB には依存しない。
//
// 繰越仕訳は「翌年 1/1 時点で残っている残高の宣言」だけを行う。
// - 資産・負債（と元入金以外の純資産）: 年末残高をそのままの向きで繰り越す
// - 元入金: 「元入金 ＋ 事業主借 − 事業主貸 ＋ 当年損益」に振り替えて繰り越す
// - 事業主貸・事業主借・収益・費用: 行にしない（翌年は集計起点の切替でゼロスタート）

import { carriesBalanceForward, signedAmount } from "@/lib/ledger/balance";
import type { AccountType, Side } from "@/lib/ledger/types";

// 繰越計算の元になる仕訳明細。残高集計用の明細に補助科目を加えた形。
export type CarryoverSourceLine = {
  accountId: number;
  subAccountId: number | null;
  accountType: AccountType;
  normalSide: Side;
  side: Side;
  amount: number;
};

// 科目×補助科目ごとの残高（通常残高方向を正とする）。
export type CarryoverBalance = {
  accountId: number;
  subAccountId: number | null;
  accountType: AccountType;
  normalSide: Side;
  balance: number;
};

// 繰越仕訳の 1 行。
export type CarryoverLine = {
  accountId: number;
  subAccountId: number | null;
  side: Side;
  amount: number;
};

const opposite = (side: Side): Side => (side === "debit" ? "credit" : "debit");

/**
 * 仕訳明細を科目×補助科目ごとの残高に集計する。
 * 補助科目ごとに分けるのは、繰越仕訳でも補助科目の内訳を保つため。
 */
export function computeCarryoverBalances(
  lines: readonly CarryoverSourceLine[],
): CarryoverBalance[] {
  const balances = new Map<string, CarryoverBalance>();
  for (const line of lines) {
    const key = `${line.accountId}:${line.subAccountId ?? ""}`;
    const current = balances.get(key);
    if (current) {
      current.balance += signedAmount(line);
    } else {
      balances.set(key, {
        accountId: line.accountId,
        subAccountId: line.subAccountId,
        accountType: line.accountType,
        normalSide: line.normalSide,
        balance: signedAmount(line),
      });
    }
  }
  return [...balances.values()];
}

/**
 * 繰越仕訳の明細を組み立てる。
 * - 収益・費用は繰り越さない
 * - 元入金・事業主貸・事業主借は行にせず、新しい元入金 1 行に畳み込む
 * - 残高 0 は省略、逆残高（マイナス）は反対側に繰り越す
 * - 借方合計と貸方合計が一致しなければ例外（仕訳データ不整合の検算）
 * 行順は借方 → 貸方。
 */
export function buildCarryoverLines(params: {
  balances: readonly CarryoverBalance[];
  netIncome: number;
  capitalAccountId: number; // 元入金
  ownerDrawAccountId: number | null; // 事業主貸（無ければ null）
  ownerLoanAccountId: number | null; // 事業主借（無ければ null）
}): CarryoverLine[] {
  const {
    balances,
    netIncome,
    capitalAccountId,
    ownerDrawAccountId,
    ownerLoanAccountId,
  } = params;

  // 新しい元入金に畳み込む科目。行としては繰り越さない。
  const foldedIds = new Set(
    [capitalAccountId, ownerDrawAccountId, ownerLoanAccountId].filter(
      (id): id is number => id !== null,
    ),
  );

  // 畳み込む科目の残高を貸方方向（純資産の増える向き）に揃えて合算する。
  // 「元入金 ＋ 事業主借 − 事業主貸」は、事業主貸（借方残高）が
  // 貸方方向ではマイナスになるので、この合算と同じ意味になる。
  let newCapital = netIncome;
  for (const b of balances) {
    if (!foldedIds.has(b.accountId)) continue;
    newCapital += b.normalSide === "credit" ? b.balance : -b.balance;
  }

  const lines: CarryoverLine[] = [];
  for (const b of balances) {
    if (!carriesBalanceForward(b.accountType)) continue;
    if (foldedIds.has(b.accountId)) continue;
    if (b.balance === 0) continue;
    lines.push({
      accountId: b.accountId,
      subAccountId: b.subAccountId,
      side: b.balance > 0 ? b.normalSide : opposite(b.normalSide),
      amount: Math.abs(b.balance),
    });
  }
  if (newCapital !== 0) {
    lines.push({
      accountId: capitalAccountId,
      subAccountId: null,
      side: newCapital > 0 ? "credit" : "debit",
      amount: Math.abs(newCapital),
    });
  }

  // 検算：貸借対照表の恒等式が成り立っていれば必ず一致する。
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (line.side === "debit") debitTotal += line.amount;
    else creditTotal += line.amount;
  }
  if (debitTotal !== creditTotal) {
    throw new Error(
      `繰越仕訳の貸借が一致しません（借方 ${debitTotal}・貸方 ${creditTotal}）。仕訳データを確認してください。`,
    );
  }

  return [
    ...lines.filter((line) => line.side === "debit"),
    ...lines.filter((line) => line.side === "credit"),
  ];
}
