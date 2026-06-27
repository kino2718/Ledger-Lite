import { describe, expect, test } from "vitest";
import { buildLedgerRows, counterAccountLabel } from "./ledger";
import type { LedgerSourceLine } from "./ledger";

// テスト用に元帳の入力明細を組み立てるヘルパー（side と amount だけ必須）。
function src(
  partial: Partial<LedgerSourceLine> &
    Pick<LedgerSourceLine, "side" | "amount">,
): LedgerSourceLine {
  return {
    entryId: partial.entryId ?? 1,
    entryDate: partial.entryDate ?? "2026-01-01",
    description: partial.description ?? null,
    side: partial.side,
    amount: partial.amount,
    siblings: partial.siblings ?? [],
  };
}

describe("counterAccountLabel", () => {
  test("相手が 1 科目ならその名前を返す", () => {
    expect(counterAccountLabel([{ accountId: 1, accountName: "現金" }])).toBe(
      "現金",
    );
  });

  test("相手が 2 科目以上なら諸口", () => {
    expect(
      counterAccountLabel([
        { accountId: 1, accountName: "現金" },
        { accountId: 2, accountName: "売掛金" },
      ]),
    ).toBe("諸口");
  });

  test("同じ科目が複数明細でも 1 科目として名前を返す", () => {
    expect(
      counterAccountLabel([
        { accountId: 1, accountName: "現金" },
        { accountId: 1, accountName: "現金" },
      ]),
    ).toBe("現金");
  });

  test("相手がいなければ空文字", () => {
    expect(counterAccountLabel([])).toBe("");
  });
});

describe("buildLedgerRows", () => {
  test("空配列なら空配列", () => {
    expect(buildLedgerRows({ lines: [], accountType: "asset" })).toEqual([]);
  });

  test("資産科目は借方で残高が増え、貸方で減る（残高を積み上げる）", () => {
    const rows = buildLedgerRows({
      lines: [
        src({ side: "debit", amount: 1000 }),
        src({ side: "credit", amount: 300 }),
      ],
      accountType: "asset",
    });
    expect(rows.map((r) => r.balance)).toEqual([1000, 700]);
    // 借方明細は借方列に金額、貸方列は 0（その逆も同様）。
    expect(rows[0]).toMatchObject({ debit: 1000, credit: 0 });
    expect(rows[1]).toMatchObject({ debit: 0, credit: 300 });
  });

  test("収益科目は貸方で残高が増え、借方で減る", () => {
    const rows = buildLedgerRows({
      lines: [
        src({ side: "credit", amount: 150000 }),
        src({ side: "debit", amount: 5000 }),
      ],
      accountType: "revenue",
    });
    expect(rows.map((r) => r.balance)).toEqual([150000, 145000]);
  });

  test("openingBalance（期首繰越）から積み上げる", () => {
    const rows = buildLedgerRows({
      lines: [src({ side: "debit", amount: 1000 })],
      accountType: "asset",
      openingBalance: 5000,
    });
    expect(rows[0].balance).toBe(6000);
  });

  test("各行に相手科目（諸口含む）と日付・摘要が入る", () => {
    const rows = buildLedgerRows({
      lines: [
        src({
          entryId: 10,
          entryDate: "2026-03-01",
          description: "電気料金",
          side: "debit",
          amount: 8000,
          siblings: [{ accountId: 1, accountName: "現金" }],
        }),
        src({
          entryId: 11,
          side: "debit",
          amount: 5000,
          siblings: [
            { accountId: 1, accountName: "現金" },
            { accountId: 2, accountName: "普通預金" },
          ],
        }),
      ],
      accountType: "expense",
    });
    expect(rows[0]).toMatchObject({
      entryId: 10,
      entryDate: "2026-03-01",
      description: "電気料金",
      counterLabel: "現金",
    });
    expect(rows[1].counterLabel).toBe("諸口");
  });
});
