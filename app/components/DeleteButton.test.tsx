// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteButton } from "./DeleteButton";

// 削除アクションと window.confirm はどちらもモックにして、
// 「確認の結果でアクションが実行されるか」だけを見る。
const actionMock = vi.fn();
const confirmMock = vi.fn();

beforeEach(() => {
  actionMock.mockReset();
  confirmMock.mockReset();
  window.confirm = confirmMock;
});
afterEach(cleanup);

describe("DeleteButton", () => {
  test("確認で OK すると削除アクションが実行される", async () => {
    confirmMock.mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <DeleteButton action={actionMock} confirmMessage="削除しますか？" />,
    );

    await user.click(screen.getByRole("button", { name: "削除" }));

    // 確認ダイアログにはページ側から渡した文言がそのまま出る。
    expect(confirmMock).toHaveBeenCalledExactlyOnceWith("削除しますか？");
    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
  });

  test("確認でキャンセルすると削除アクションは実行されない", async () => {
    confirmMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(
      <DeleteButton action={actionMock} confirmMessage="削除しますか？" />,
    );

    await user.click(screen.getByRole("button", { name: "削除" }));

    // 確認は出るが、キャンセルなのでアクションには到達しない。
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(actionMock).not.toHaveBeenCalled();
  });
});
