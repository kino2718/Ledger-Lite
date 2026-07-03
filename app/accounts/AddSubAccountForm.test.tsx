// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddSubAccountForm } from "./AddSubAccountForm";

// Server Action はモックにして、送信内容（FormData）とエラー表示だけを見る。
const actionMock = vi.fn();

beforeEach(() => {
  actionMock.mockReset();
});
afterEach(cleanup);

describe("AddSubAccountForm", () => {
  test("名前を入れて追加すると name が送信される", async () => {
    const user = userEvent.setup();
    render(<AddSubAccountForm action={actionMock} />);

    await user.type(screen.getByLabelText("新しい補助科目名"), "A社");
    await user.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const formData = actionMock.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("A社");
  });

  test("アクションがエラーを返すと画面に表示される", async () => {
    actionMock.mockResolvedValue({
      errors: ["この補助科目名は既に使われています。"],
    });
    const user = userEvent.setup();
    render(<AddSubAccountForm action={actionMock} />);

    // 名前は required なので、何か入れないと送信が action まで届かない。
    // 値自体は結果に影響しない（action はモック）。
    await user.type(screen.getByLabelText("新しい補助科目名"), "A社");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(
      await screen.findByText("この補助科目名は既に使われています。"),
    ).toBeInTheDocument();
  });
});
