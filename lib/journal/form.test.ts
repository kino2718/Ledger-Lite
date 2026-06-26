import { describe, expect, test } from "vitest";
import { linesToPairs, parseJournalEntryForm } from "./form";
import type { JournalLineInput } from "./validation";

// テスト用に FormData を組み立てるヘルパー。
function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

describe("parseJournalEntryForm", () => {
  test("1 組（借方・貸方）を借方→貸方の順で 2 明細に変換する", () => {
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        description: "現金売上",
        pairCount: "1",
        "debitAccountId.0": "1",
        "debitSubAccountId.0": "",
        "debitAmount.0": "1000",
        "creditAccountId.0": "8",
        "creditSubAccountId.0": "",
        "creditAmount.0": "1000",
      }),
    );

    expect(result).toEqual({
      entryDate: "2026-06-23",
      description: "現金売上",
      lines: [
        { accountId: 1, subAccountId: null, side: "debit", amount: 1000 },
        { accountId: 8, subAccountId: null, side: "credit", amount: 1000 },
      ],
    });
  });

  test("文字列の金額・科目IDは数値に変換される", () => {
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        pairCount: "1",
        "debitAccountId.0": "3",
        "debitAmount.0": "25000",
        "creditAccountId.0": "8",
        "creditAmount.0": "25000",
      }),
    );
    expect(typeof result.lines[0].accountId).toBe("number");
    expect(result.lines[0].amount).toBe(25000);
  });

  test("補助科目IDは値があれば数値、空なら null", () => {
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        pairCount: "1",
        "debitAccountId.0": "10",
        "debitSubAccountId.0": "5",
        "debitAmount.0": "8000",
        "creditAccountId.0": "1",
        "creditSubAccountId.0": "",
        "creditAmount.0": "8000",
      }),
    );
    expect(result.lines[0].subAccountId).toBe(5);
    expect(result.lines[1].subAccountId).toBeNull();
  });

  test("片側だけ入力された組は、入力の無い側を無視する", () => {
    // 組0=借方のみ、組1=貸方のみ。
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        pairCount: "2",
        "debitAccountId.0": "1",
        "debitSubAccountId.0": "",
        "debitAmount.0": "5000",
        "creditAccountId.0": "",
        "creditSubAccountId.0": "",
        "creditAmount.0": "",
        "debitAccountId.1": "",
        "debitSubAccountId.1": "",
        "debitAmount.1": "",
        "creditAccountId.1": "8",
        "creditSubAccountId.1": "",
        "creditAmount.1": "5000",
      }),
    );
    expect(result.lines).toEqual([
      { accountId: 1, subAccountId: null, side: "debit", amount: 5000 },
      { accountId: 8, subAccountId: null, side: "credit", amount: 5000 },
    ]);
  });

  test("科目も金額も空の側は無視する（完全に空の組は明細ゼロ）", () => {
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        pairCount: "1",
        "debitAccountId.0": "",
        "debitSubAccountId.0": "",
        "debitAmount.0": "",
        "creditAccountId.0": "",
        "creditSubAccountId.0": "",
        "creditAmount.0": "",
      }),
    );
    expect(result.lines).toEqual([]);
  });

  test("片方だけ（科目だけ／金額だけ）入力された側は無視せず取り込む", () => {
    // 検証は後段（validateJournalEntry 等）が行うため、ここでは取り込む。
    const result = parseJournalEntryForm(
      formOf({
        entryDate: "2026-06-23",
        pairCount: "1",
        "debitAccountId.0": "1", // 科目だけ（金額なし）
        "debitAmount.0": "",
        "creditAccountId.0": "", // 金額だけ（科目なし）
        "creditAmount.0": "1000",
      }),
    );
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ accountId: 1, side: "debit" });
    expect(result.lines[1]).toMatchObject({ side: "credit", amount: 1000 });
  });

  test("摘要は空・空白のみなら null", () => {
    const blank = parseJournalEntryForm(
      formOf({ entryDate: "2026-06-23", description: "", pairCount: "0" }),
    );
    expect(blank.description).toBeNull();

    const spaces = parseJournalEntryForm(
      formOf({ entryDate: "2026-06-23", description: "   ", pairCount: "0" }),
    );
    expect(spaces.description).toBeNull();
  });

  test("pairCount が無い／0 なら明細は空", () => {
    const result = parseJournalEntryForm(formOf({ entryDate: "2026-06-23" }));
    expect(result.lines).toEqual([]);
  });
});

// 数値の明細から、テストで見やすい片側入力ヘルパー。
function line(
  side: "debit" | "credit",
  accountId: number,
  amount: number,
  subAccountId: number | null = null,
): JournalLineInput {
  return { accountId, subAccountId, side, amount };
}

describe("linesToPairs", () => {
  test("借方1・貸方1 は 1 組にまとまり、数値は文字列になる", () => {
    const pairs = linesToPairs([
      line("debit", 1, 1000),
      line("credit", 8, 1000),
    ]);
    expect(pairs).toEqual([
      {
        debit: { accountId: "1", subAccountId: "", amount: "1000" },
        credit: { accountId: "8", subAccountId: "", amount: "1000" },
      },
    ]);
  });

  test("借方・貸方をそれぞれ上から詰める（入力順に依存しない）", () => {
    // 借方2件・貸方1件が、借方→借方→貸方の順で渡ってきても上詰めで組む。
    const pairs = linesToPairs([
      line("debit", 1, 700),
      line("debit", 2, 300),
      line("credit", 8, 1000),
    ]);
    expect(pairs).toEqual([
      {
        debit: { accountId: "1", subAccountId: "", amount: "700" },
        credit: { accountId: "8", subAccountId: "", amount: "1000" },
      },
      {
        debit: { accountId: "2", subAccountId: "", amount: "300" },
        credit: { accountId: "", subAccountId: "", amount: "" },
      },
    ]);
  });

  test("件数の少ない側は空で埋める（行数は多いほうに合わせる）", () => {
    const pairs = linesToPairs([
      line("debit", 1, 1000),
      line("credit", 8, 600),
      line("credit", 9, 400),
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs[1].debit).toEqual({
      accountId: "",
      subAccountId: "",
      amount: "",
    });
    expect(pairs[1].credit).toEqual({
      accountId: "9",
      subAccountId: "",
      amount: "400",
    });
  });

  test("補助科目は値があれば文字列、null なら空文字", () => {
    const pairs = linesToPairs([
      line("debit", 10, 8000, 5),
      line("credit", 1, 8000, null),
    ]);
    expect(pairs[0].debit.subAccountId).toBe("5");
    expect(pairs[0].credit.subAccountId).toBe("");
  });

  test("明細が空なら組も空", () => {
    expect(linesToPairs([])).toEqual([]);
  });
});
