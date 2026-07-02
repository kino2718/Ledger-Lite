import { describe, expect, test } from "vitest";
import { parseAccountForm } from "./form";

// テスト用に FormData を組み立てるヘルパー。
function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

describe("parseAccountForm", () => {
  test("すべての項目を AccountInput に変換する", () => {
    const result = parseAccountForm(
      formOf({
        code: "300",
        name: "事業主貸",
        accountType: "equity",
        normalSide: "debit",
        isActive: "on",
      }),
    );
    expect(result).toEqual({
      code: "300",
      name: "事業主貸",
      accountType: "equity",
      normalSide: "debit",
      isActive: true,
    });
  });

  test("コードは空・空白のみなら null、前後の空白は取り除く", () => {
    expect(parseAccountForm(formOf({ code: "" })).code).toBeNull();
    expect(parseAccountForm(formOf({ code: "   " })).code).toBeNull();
    expect(parseAccountForm(formOf({ code: " 100 " })).code).toBe("100");
  });

  test("科目名の前後の空白は取り除く", () => {
    expect(parseAccountForm(formOf({ name: " 現金 " })).name).toBe("現金");
  });

  test("isActive はチェックボックスの有無で判定する", () => {
    // チェックを外すとフィールド自体が送られない。
    expect(parseAccountForm(formOf({ name: "現金" })).isActive).toBe(false);
    expect(
      parseAccountForm(formOf({ name: "現金", isActive: "on" })).isActive,
    ).toBe(true);
  });

  test("フィールドが無ければ空文字として扱う（検証は後段に委ねる）", () => {
    const result = parseAccountForm(new FormData());
    expect(result).toEqual({
      code: null,
      name: "",
      accountType: "",
      normalSide: "",
      isActive: false,
    });
  });
});
