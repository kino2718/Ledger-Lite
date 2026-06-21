import { describe, expect, test } from "vitest";
import { validateAgainstMasters, validateJournalEntry } from "./validation";
import type {
  AccountMaster,
  JournalEntryInput,
  JournalLineInput,
} from "./validation";

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

describe("validateAgainstMasters", () => {
  // そのユーザーが所有する勘定科目（補助科目つき）。
  // 1: 補助なし / 2: 補助 10(有効)・11(無効) / 3: 無効な科目
  function masters(): AccountMaster[] {
    return [
      { id: 1, isActive: true, subAccounts: [] },
      {
        id: 2,
        isActive: true,
        subAccounts: [
          { id: 10, isActive: true },
          { id: 11, isActive: false },
        ],
      },
      { id: 3, isActive: false, subAccounts: [] },
    ];
  }

  function entryWith(lines: JournalLineInput[]): JournalEntryInput {
    return { entryDate: "2026-06-20", description: null, lines };
  }

  test("存在し有効な科目・正しい補助科目なら ok", () => {
    const entry = entryWith([
      { accountId: 1, subAccountId: null, side: "debit", amount: 1000 },
      { accountId: 2, subAccountId: 10, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters())).toEqual({ ok: true });
  });

  test("ユーザーが持たない（存在しない）科目は弾く", () => {
    const entry = entryWith([
      { accountId: 99, subAccountId: null, side: "debit", amount: 1000 },
      { accountId: 1, subAccountId: null, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters()).ok).toBe(false);
  });

  test("無効（isActive=false）な科目は弾く", () => {
    const entry = entryWith([
      { accountId: 3, subAccountId: null, side: "debit", amount: 1000 },
      { accountId: 1, subAccountId: null, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters()).ok).toBe(false);
  });

  test("補助科目がその勘定科目に属していないと弾く", () => {
    // 補助 10 は科目 2 のもの。科目 1 に付けるのは整合性違反。
    const entry = entryWith([
      { accountId: 1, subAccountId: 10, side: "debit", amount: 1000 },
      { accountId: 2, subAccountId: null, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters()).ok).toBe(false);
  });

  test("無効な補助科目は弾く", () => {
    const entry = entryWith([
      { accountId: 2, subAccountId: 11, side: "debit", amount: 1000 },
      { accountId: 1, subAccountId: null, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters()).ok).toBe(false);
  });

  test("subAccountId が null なら補助科目チェックはしない", () => {
    const entry = entryWith([
      { accountId: 2, subAccountId: null, side: "debit", amount: 1000 },
      { accountId: 1, subAccountId: null, side: "credit", amount: 1000 },
    ]);
    expect(validateAgainstMasters(entry, masters())).toEqual({ ok: true });
  });

  test("同じ種類のエラーは重複させずにまとめる", () => {
    const entry = entryWith([
      { accountId: 99, subAccountId: null, side: "debit", amount: 500 },
      { accountId: 98, subAccountId: null, side: "credit", amount: 500 },
    ]);
    const result = validateAgainstMasters(entry, masters());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 2 行とも「存在しない科目」だが、メッセージは 1 件に集約される。
      expect(result.errors).toHaveLength(1);
    }
  });
});
