import { describe, expect, test } from "vitest";
import { validateAccountInput, validateSubAccountName } from "./validation";
import type { AccountInput } from "./validation";
import type { AccountType, Side } from "@/lib/ledger/types";

// テスト用の正しい入力。上書きしたい項目だけ差し替えて使う。
function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    code: "100",
    name: "現金",
    accountType: "asset",
    normalSide: "debit",
    isActive: true,
    ...overrides,
  };
}

describe("validateAccountInput", () => {
  test("正しい入力は通る", () => {
    expect(validateAccountInput(accountInput())).toEqual({ ok: true });
  });

  test("コードは null（未設定）でも通る", () => {
    expect(validateAccountInput(accountInput({ code: null }))).toEqual({
      ok: true,
    });
  });

  test("科目名が空ならエラー", () => {
    const result = validateAccountInput(accountInput({ name: "" }));
    expect(result).toEqual({
      ok: false,
      errors: ["科目名を入力してください。"],
    });
  });

  test("科目名が空白のみでもエラー", () => {
    const result = validateAccountInput(accountInput({ name: "   " }));
    expect(result.ok).toBe(false);
  });

  test("分類が想定外の値ならエラー", () => {
    // フォーム改ざん等で型どおりでない値が来るケース。
    const result = validateAccountInput(
      accountInput({ accountType: "cash" as AccountType }),
    );
    expect(result).toEqual({
      ok: false,
      errors: ["分類の値が正しくありません。"],
    });
  });

  test("通常残高の向きが想定外の値ならエラー", () => {
    const result = validateAccountInput(
      accountInput({ normalSide: "" as Side }),
    );
    expect(result).toEqual({
      ok: false,
      errors: ["通常残高の向きの値が正しくありません。"],
    });
  });

  test("エラーは最初の 1 件で止めず、すべて集めて返す", () => {
    const result = validateAccountInput(
      accountInput({
        name: "",
        accountType: "" as AccountType,
        normalSide: "" as Side,
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: [
        "科目名を入力してください。",
        "分類の値が正しくありません。",
        "通常残高の向きの値が正しくありません。",
      ],
    });
  });
});

describe("validateSubAccountName", () => {
  test("名前があれば通る", () => {
    expect(validateSubAccountName("電気")).toEqual({ ok: true });
  });

  test("空ならエラー", () => {
    expect(validateSubAccountName("")).toEqual({
      ok: false,
      errors: ["補助科目名を入力してください。"],
    });
  });

  test("空白のみでもエラー", () => {
    expect(validateSubAccountName("   ").ok).toBe(false);
  });
});
