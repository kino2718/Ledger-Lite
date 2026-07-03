// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubAccountItem } from "./SubAccountItem";

// Server Action と window.confirm はモックにして、フォームの組み立てと
// 送信内容（FormData）だけを見る。
const updateMock = vi.fn();
const deleteMock = vi.fn();
const confirmMock = vi.fn();

function renderItem(
  props: Partial<React.ComponentProps<typeof SubAccountItem>> = {},
) {
  return render(
    <SubAccountItem
      name="A社"
      isActive={true}
      inUse={false}
      updateAction={updateMock}
      deleteAction={deleteMock}
      {...props}
    />,
  );
}

beforeEach(() => {
  updateMock.mockReset();
  deleteMock.mockReset();
  confirmMock.mockReset();
  window.confirm = confirmMock;
});
afterEach(cleanup);

describe("SubAccountItem", () => {
  test("名前と有効チェックが初期値で表示される", () => {
    renderItem({ name: "B社", isActive: false });
    expect(
      (screen.getByLabelText("補助科目名") as HTMLInputElement).value,
    ).toBe("B社");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  test("名前を変えて保存すると name と isActive が送信される", async () => {
    const user = userEvent.setup();
    renderItem();

    const nameInput = screen.getByLabelText("補助科目名");
    await user.clear(nameInput);
    await user.type(nameInput, "C社");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const formData = updateMock.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe("C社");
    // チェックは付いたままなので isActive が送られる。
    expect(formData.get("isActive")).not.toBeNull();
  });

  test("有効チェックを外して保存すると isActive は送信されない", async () => {
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const formData = updateMock.mock.calls[0][1] as FormData;
    expect(formData.get("isActive")).toBeNull();
  });

  test("未使用なら削除ボタンが出て、確認 OK で削除アクションが実行される", async () => {
    confirmMock.mockReturnValue(true);
    const user = userEvent.setup();
    renderItem({ inUse: false });

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
  });

  test("確認でキャンセルすると削除アクションは実行されない", async () => {
    confirmMock.mockReturnValue(false);
    const user = userEvent.setup();
    renderItem({ inUse: false });

    await user.click(screen.getByRole("button", { name: "削除" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test("使用中は削除ボタンが出ず「使用中」と表示される", () => {
    renderItem({ inUse: true });
    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("使用中")).toBeInTheDocument();
  });

  test("更新アクションがエラーを返すと画面に表示される", async () => {
    updateMock.mockResolvedValue({
      errors: ["この補助科目名は既に使われています。"],
    });
    const user = userEvent.setup();
    renderItem();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("この補助科目名は既に使われています。"),
    ).toBeInTheDocument();
  });
});
