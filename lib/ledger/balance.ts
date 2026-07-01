// 仕訳明細から残高・損益を集計する純粋関数。DB には依存しない。
// 残高は「通常残高方向」を正とする（資産・費用=借方、負債・純資産・収益=貸方）。

import type {
  AccountBalance,
  AccountType,
  BalanceLine,
  ProfitLoss,
  Side,
  TrialBalance,
  TrialBalanceRow,
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

/**
 * 仕訳明細から合計残高試算表を集計する。科目ごとに借方合計・貸方合計を出し、
 * その差額を残高として大きい側の列（借方残高／貸方残高）に置く。各列の総計も返す。
 * 1 仕訳は貸借が一致するため、借方合計＝貸方合計・借方残高＝貸方残高となる
 * （ずれたら仕訳データの不整合＝検算）。残高 0 の科目も残し、初出順を保つ。
 */
export function computeTrialBalance(
  lines: readonly BalanceLine[],
): TrialBalance {
  const rows = new Map<number, TrialBalanceRow>();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    let row = rows.get(line.accountId);
    if (!row) {
      row = {
        accountId: line.accountId,
        accountType: line.accountType,
        debit: 0,
        credit: 0,
        debitBalance: 0,
        creditBalance: 0,
      };
      rows.set(line.accountId, row);
    }
    if (line.side === "debit") {
      row.debit += line.amount;
      totalDebit += line.amount;
    } else {
      row.credit += line.amount;
      totalCredit += line.amount;
    }
  }

  // 残高は借方合計と貸方合計の差額を、大きい側の列に置く。
  let totalDebitBalance = 0;
  let totalCreditBalance = 0;
  for (const row of rows.values()) {
    const net = row.debit - row.credit;
    if (net > 0) {
      row.debitBalance = net;
      totalDebitBalance += net;
    } else if (net < 0) {
      row.creditBalance = -net;
      totalCreditBalance += -net;
    }
  }

  return {
    rows: [...rows.values()],
    totalDebit,
    totalCredit,
    totalDebitBalance,
    totalCreditBalance,
  };
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
