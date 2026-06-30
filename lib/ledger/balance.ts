// 仕訳明細から残高・損益を集計する純粋関数。DB には依存しない。
// 残高は「通常残高方向」を正とする（資産・費用=借方、負債・純資産・収益=貸方）。

import type {
  AccountBalance,
  AccountType,
  BalanceLine,
  ProfitLoss,
  Side,
} from "./types";

// 借方を通常残高とする科目分類。
const DEBIT_NORMAL: ReadonlySet<AccountType> = new Set(["asset", "expense"]);

/**
 * 科目分類から決まる「既定の」通常残高の向き。科目作成時の初期値に使う。
 * 事業主貸のような評価勘定はこの既定と逆向きになるため、実際の符号判定は
 * 科目ごとの normalSide（signedAmount の引数）を見る。
 */
export function normalBalanceSide(type: AccountType): Side {
  return DEBIT_NORMAL.has(type) ? "debit" : "credit";
}

/** 1 行を通常残高方向で符号付き金額にする（通常側=正、逆側=負）。 */
export function signedAmount(line: {
  side: Side;
  normalSide: Side;
  amount: number;
}): number {
  return line.side === line.normalSide ? line.amount : -line.amount;
}

/** 科目ごとの残高を集計する。残高 0 の科目も残し、初出順を保つ。 */
export function computeAccountBalances(
  lines: readonly BalanceLine[],
): AccountBalance[] {
  const balances = new Map<number, AccountBalance>();
  for (const line of lines) {
    const current = balances.get(line.accountId);
    if (current) {
      current.balance += signedAmount(line);
    } else {
      balances.set(line.accountId, {
        accountId: line.accountId,
        accountType: line.accountType,
        balance: signedAmount(line),
      });
    }
  }
  return [...balances.values()];
}

/** 収益・費用・差引（純損益）を集計する。 */
export function computeProfitLoss(lines: readonly BalanceLine[]): ProfitLoss {
  let revenue = 0;
  let expense = 0;
  for (const line of lines) {
    if (line.accountType === "revenue") {
      revenue += signedAmount(line);
    } else if (line.accountType === "expense") {
      expense += signedAmount(line);
    }
  }
  return { revenue, expense, net: revenue - expense };
}
