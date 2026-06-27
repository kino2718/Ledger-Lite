// 総勘定元帳・補助元帳の表示用に、ある科目（必要なら補助科目）の明細を
// 時系列に並べて残高を積み上げる純粋関数。DB には依存しない。
// 残高の向き（通常残高方向）は signedAmount に委ねて一元化する。

import type { AccountType, Side } from "./types";
import { signedAmount } from "./balance";

// 相手科目を求めるための、同じ仕訳の「他の明細」の科目。
export type LedgerSibling = { accountId: number; accountName: string };

// 元帳に並べる 1 明細の入力。siblings は同一仕訳のうち対象科目以外の明細
// （相手科目の判定に使う）。lines は日付順に並んでいる前提。
export type LedgerSourceLine = {
  entryId: number;
  entryDate: string;
  description: string | null;
  side: Side;
  amount: number;
  siblings: LedgerSibling[];
};

// 元帳の 1 行（表示用）。debit/credit はどちらか一方が金額・他方は 0。
// balance は通常残高方向の running balance。
export type LedgerRow = {
  entryId: number;
  entryDate: string;
  description: string | null;
  counterLabel: string;
  debit: number;
  credit: number;
  balance: number;
};

// 相手科目が複数に分かれるときの簿記表記。
const MULTIPLE_COUNTER_LABEL = "諸口";

/**
 * 同一仕訳の他明細から相手科目のラベルを決める。
 * 相手が 1 科目ならその名前、2 科目以上なら「諸口」、相手なしなら空文字。
 * 同じ科目が複数明細に現れても 1 科目として数える。
 */
export function counterAccountLabel(siblings: LedgerSibling[]): string {
  // 同じ accountId なら名前も同じなので、上書きされても結果は変わらない。
  const distinct = new Map<number, string>();
  for (const s of siblings) {
    distinct.set(s.accountId, s.accountName);
  }
  if (distinct.size === 0) return "";
  if (distinct.size === 1) return [...distinct.values()][0];
  return MULTIPLE_COUNTER_LABEL;
}

/**
 * 日付順に並んだ明細から元帳の行を組み立てる。
 * openingBalance（期首繰越）から始めて、各明細を通常残高方向で積み上げる。
 * 借方科目（資産・費用）は借方で残高が増え、貸方科目（負債・純資産・収益）は
 * 貸方で増える。
 */
export function buildLedgerRows({
  lines,
  accountType,
  openingBalance = 0,
}: {
  lines: LedgerSourceLine[];
  accountType: AccountType;
  openingBalance?: number;
}): LedgerRow[] {
  let balance = openingBalance;
  return lines.map((line) => {
    // accountId は符号計算に使わないのでダミーで足りる。
    balance += signedAmount({
      accountId: 0,
      accountType,
      side: line.side,
      amount: line.amount,
    });
    return {
      entryId: line.entryId,
      entryDate: line.entryDate,
      description: line.description,
      counterLabel: counterAccountLabel(line.siblings),
      debit: line.side === "debit" ? line.amount : 0,
      credit: line.side === "credit" ? line.amount : 0,
      balance,
    };
  });
}
