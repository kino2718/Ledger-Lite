// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountForm } from "./AccountForm";

// AccountForm は action を prop で受け取るため、テストではモックを渡す
// （server-only / Prisma を芋づるに読み込まない）。
const actionMock = vi.fn();

// action を毎回渡す手間を省くレンダーヘルパー。追加の props は上書きできる。
function renderForm(
  props: Partial<React.ComponentProps<typeof AccountForm>> = {},
) {
  return render(<AccountForm action={actionMock} {...props} />);
}

function typeSelect(): HTMLSelectElement {
  return screen.getByLabelText("分類") as HTMLSelectElement;
}

function sideRadio(label: "借方" | "貸方"): HTMLInputElement {
  return screen.getByRole("radio", { name: label }) as HTMLInputElement;
}

beforeEach(() => {
  actionMock.mockReset();
});
afterEach(cleanup);

describe("AccountForm", () => {
  test("初期表示は分類が資産・向きが借方", () => {
    renderForm();
    expect(typeSelect().value).toBe("asset");
    expect(sideRadio("借方").checked).toBe(true);
    expect(sideRadio("貸方").checked).toBe(false);
  });

  test("分類を変えると向きが既定に追従する", async () => {
    const user = userEvent.setup();
    renderForm();

    // 資産（借方）→ 収益（貸方）
    await user.selectOptions(typeSelect(), "revenue");
    expect(sideRadio("貸方").checked).toBe(true);

    // 収益（貸方）→ 費用（借方）
    await user.selectOptions(typeSelect(), "expense");
    expect(sideRadio("借方").checked).toBe(true);
  });

  test("向きは手動で上書きでき、そのまま送信される（評価勘定）", async () => {
    const user = userEvent.setup();
    renderForm();

    // 純資産にすると既定は貸方。事業主貸を想定して借方に上書きする。
    await user.selectOptions(typeSelect(), "equity");
    expect(sideRadio("貸方").checked).toBe(true);
    await user.click(sideRadio("借方"));
    expect(sideRadio("借方").checked).toBe(true);

    await user.type(screen.getByLabelText("科目名"), "事業主貸");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("事業主貸");
    expect(formData.get("accountType")).toBe("equity");
    expect(formData.get("normalSide")).toBe("debit");
  });

  test("手動で上書きした後でも、分類を変え直すと既定に戻る", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(typeSelect(), "equity");
    await user.click(sideRadio("借方")); // 手動上書き
    await user.selectOptions(typeSelect(), "liability"); // 分類を変更
    expect(sideRadio("貸方").checked).toBe(true); // 負債の既定に戻る
  });

  test("初期値を渡すと編集モードとして埋まった状態で表示される", () => {
    renderForm({
      initialCode: "300",
      initialName: "事業主貸",
      initialAccountType: "equity",
      initialNormalSide: "debit",
      initialIsActive: false,
      showIsActive: true,
      submitLabel: "更新",
    });

    expect((screen.getByLabelText("科目名") as HTMLInputElement).value).toBe(
      "事業主貸",
    );
    expect(
      (screen.getByLabelText("科目コード（任意）") as HTMLInputElement).value,
    ).toBe("300");
    expect(typeSelect().value).toBe("equity");
    // 既定（純資産=貸方）ではなく、保存されている向き（借方）が選ばれる。
    expect(sideRadio("借方").checked).toBe(true);
    // 編集モードでは有効/無効のチェックボックスが出る（無効の科目なので外れている）。
    expect(
      (screen.getByRole("checkbox") as HTMLInputElement).checked,
    ).toBe(false);
    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
  });

  test("新規作成では有効/無効のチェックボックスは出ない", () => {
    renderForm();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("使用中（inUse）は分類・向きが変更不可でも、値は hidden で送信される", async () => {
    const user = userEvent.setup();
    renderForm({
      initialName: "現金",
      initialAccountType: "asset",
      initialNormalSide: "debit",
      showIsActive: true,
      inUse: true,
      submitLabel: "更新",
    });

    // 分類・向きのコントロールは無効化され、説明文が出る。
    expect(typeSelect()).toBeDisabled();
    expect(sideRadio("借方")).toBeDisabled();
    expect(sideRadio("貸方")).toBeDisabled();
    expect(
      screen.getByText(
        "仕訳で使用中のため、分類と通常残高の向きは変更できません。",
      ),
    ).toBeInTheDocument();

    // disabled のコントロールはフォーム送信に含まれないが、hidden が値を運ぶ。
    await user.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("accountType")).toBe("asset");
    expect(formData.get("normalSide")).toBe("debit");
  });

  test("有効/無効のチェックは isActive として送信される", async () => {
    const user = userEvent.setup();
    renderForm({
      initialName: "現金",
      showIsActive: true,
      submitLabel: "更新",
    });

    // 初期は有効（チェックあり）。外して送信すると isActive は送られない。
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("isActive")).toBeNull();
  });

  test("アクションがエラーを返すと画面に表示される", async () => {
    actionMock.mockResolvedValue({
      errors: ["この科目名は既に使われています。"],
    });
    const user = userEvent.setup();
    renderForm();

    // 科目名は required なので、何か入れないと送信が action まで届かない。
    // 値自体は結果に影響しない（action はモック）。
    await user.type(screen.getByLabelText("科目名"), "現金");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("この科目名は既に使われています。"),
    ).toBeInTheDocument();
  });
});
