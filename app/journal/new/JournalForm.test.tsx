// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountOption } from "@/lib/journal/queries";

// Server Action を読み込むと server-only / Prisma まで芋づるに走るため、
// アクションはモックに差し替える（このテストは UI 挙動と送信内容を検証する）。
const { actionMock } = vi.hoisted(() => ({ actionMock: vi.fn() }));
vi.mock("./actions", () => ({ createEntryAction: actionMock }));

import { JournalForm } from "./JournalForm";

const accounts: AccountOption[] = [
  { id: 1, code: "100", name: "現金", accountType: "asset", subAccounts: [] },
  { id: 8, code: "400", name: "売上高", accountType: "revenue", subAccounts: [] },
  {
    id: 10,
    code: "401",
    name: "水道光熱費",
    accountType: "expense",
    subAccounts: [{ id: 5, name: "電気" }],
  },
];

// name 属性で input/select を取り出すヘルパー（同種コントロールが多いため）。
function field(name: string): HTMLElement {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`field not found: ${name}`);
  return el as HTMLElement;
}

function rowCount(): number {
  return screen.getAllByLabelText("この行を削除").length;
}

beforeEach(() => {
  actionMock.mockReset();
});
afterEach(cleanup);

describe("JournalForm", () => {
  test("初期表示では借方・貸方の見出しと科目の選択肢が出る", () => {
    render(<JournalForm accounts={accounts} />);
    expect(screen.getByText("借方")).toBeInTheDocument();
    expect(screen.getByText("貸方")).toBeInTheDocument();
    // 科目名が option として描画されている。
    expect(screen.getAllByRole("option", { name: "現金" }).length).toBeGreaterThan(
      0,
    );
    // 初期は 1 組のみ。削除ボタンは無効。
    expect(rowCount()).toBe(1);
    expect(screen.getByLabelText("この行を削除")).toBeDisabled();
  });

  test("「明細を追加」で行が増え、×で減る", async () => {
    const user = userEvent.setup();
    render(<JournalForm accounts={accounts} />);
    expect(rowCount()).toBe(1);

    await user.click(screen.getByRole("button", { name: "明細を追加 +" }));
    expect(rowCount()).toBe(2);

    // 2 行あるので削除ボタンは有効。1 つ消すと 1 行に戻る。
    const removeButtons = screen.getAllByLabelText("この行を削除");
    expect(removeButtons[0]).toBeEnabled();
    await user.click(removeButtons[0]);
    expect(rowCount()).toBe(1);
  });

  test("科目を選ぶと、その科目の補助科目だけが選べる", async () => {
    const user = userEvent.setup();
    render(<JournalForm accounts={accounts} />);

    const debitSub = field("debitSubAccountId.0") as HTMLSelectElement;
    // 初期（科目未選択）は補助科目セレクトが無効。
    expect(debitSub).toBeDisabled();

    // 補助科目を持つ「水道光熱費」を借方科目に選ぶ。
    await user.selectOptions(field("debitAccountId.0"), "10");
    expect(debitSub).toBeEnabled();
    expect(
      screen.getAllByRole("option", { name: "電気" }).length,
    ).toBeGreaterThan(0);
  });

  test("金額を入力すると貸借の一致/不一致が切り替わる", async () => {
    const user = userEvent.setup();
    render(<JournalForm accounts={accounts} />);
    // 初期は 0 = 0 なので一致。
    expect(screen.getByText("貸借一致")).toBeInTheDocument();

    await user.type(field("debitAmount.0"), "1000");
    expect(screen.getByText("不一致")).toBeInTheDocument();

    await user.type(field("creditAmount.0"), "1000");
    expect(screen.getByText("貸借一致")).toBeInTheDocument();
  });

  test("送信すると正しいフィールド名で FormData が渡る（契約）", async () => {
    const user = userEvent.setup();
    render(<JournalForm accounts={accounts} />);

    await user.selectOptions(field("debitAccountId.0"), "1");
    await user.type(field("debitAmount.0"), "1000");
    await user.selectOptions(field("creditAccountId.0"), "8");
    await user.type(field("creditAmount.0"), "1000");

    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("pairCount")).toBe("1");
    expect(formData.get("debitAccountId.0")).toBe("1");
    expect(formData.get("debitAmount.0")).toBe("1000");
    expect(formData.get("creditAccountId.0")).toBe("8");
    expect(formData.get("creditAmount.0")).toBe("1000");
    expect(formData.get("entryDate")).toBeTruthy();
  });

  test("アクションがエラーを返すと画面に表示される", async () => {
    actionMock.mockResolvedValue({
      errors: ["借方合計と貸方合計が一致していません。"],
    });
    const user = userEvent.setup();
    render(<JournalForm accounts={accounts} />);

    await user.type(field("debitAmount.0"), "1000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("借方合計と貸方合計が一致していません。"),
    ).toBeInTheDocument();
  });
});
