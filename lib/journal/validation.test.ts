import { describe, expect, test } from "vitest";
import { validateJournalEntry } from "./validation";
import type { JournalEntryInput } from "./validation";

// 貸借一致した正常な2行仕訳を土台に、各テストで一部を崩す。
function baseEntry(): JournalEntryInput {
  return {
    entryDate: "2026-06-20",
    description: "現金売上",
    lines: [
      { accountId: 1, subAccountId: null, side: "debit", amount: 1000 },
      { accountId: 2, subAccountId: null, side: "credit", amount: 1000 },
    ],
  };
}

describe("validateJournalEntry", () => {
  test("貸借一致した2行仕訳は ok", () => {
    expect(validateJournalEntry(baseEntry())).toEqual({ ok: true });
  });

  test("3行以上でも貸借が一致していれば ok", () => {
    const entry: JournalEntryInput = {
      ...baseEntry(),
      lines: [
        { accountId: 1, subAccountId: null, side: "debit", amount: 700 },
        { accountId: 2, subAccountId: null, side: "debit", amount: 300 },
        { accountId: 3, subAccountId: null, side: "credit", amount: 1000 },
      ],
    };
    expect(validateJournalEntry(entry)).toEqual({ ok: true });
  });

  test("借方合計と貸方合計が一致しないと弾く", () => {
    const entry = baseEntry();
    entry.lines[1].amount = 900;
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("明細が1行だと弾く", () => {
    const entry: JournalEntryInput = {
      ...baseEntry(),
      lines: [{ accountId: 1, subAccountId: null, side: "debit", amount: 1000 }],
    };
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("明細が0行だと弾く", () => {
    const entry: JournalEntryInput = { ...baseEntry(), lines: [] };
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("金額が0以下だと弾く", () => {
    const entry = baseEntry();
    entry.lines[0].amount = 0;
    entry.lines[1].amount = 0;
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("金額が整数でないと弾く", () => {
    const entry = baseEntry();
    entry.lines[0].amount = 1000.5;
    entry.lines[1].amount = 1000.5;
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("取引日が YYYY-MM-DD 形式でないと弾く", () => {
    const entry = { ...baseEntry(), entryDate: "2026/06/20" };
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("存在しない日付（2026-02-30）は弾く", () => {
    const entry = { ...baseEntry(), entryDate: "2026-02-30" };
    expect(validateJournalEntry(entry).ok).toBe(false);
  });

  test("複数の不備があるとき、全部まとめてエラーを返す", () => {
    const entry: JournalEntryInput = {
      entryDate: "bad-date",
      description: null,
      lines: [{ accountId: 1, subAccountId: null, side: "debit", amount: -5 }],
    };
    const result = validateJournalEntry(entry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 取引日・行数・金額・貸借 のうち複数が同時に検出される。
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});
