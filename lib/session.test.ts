import { describe, expect, test, vi, beforeEach } from "vitest";

// server-only は react-server 条件が無いと import 時に throw する。
// vitest はその条件を立てないため、空モックに差し替えて読み込めるようにする。
vi.mock("server-only", () => ({}));

// auth() の戻り値をテストごとに差し替えられるようモック化する。
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

// 本物の redirect は NEXT_REDIRECT 例外を投げて以降の処理を止める。
// それに倣い、呼ばれたら sentinel を throw するモックにする。
const redirectError = new Error("NEXT_REDIRECT");
const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { verifySession } from "./session";

describe("verifySession", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw redirectError;
    });
  });

  test("ログイン済みならセッションを返し redirect しない", async () => {
    const session = { user: { id: "1", email: "alice@example.com" } };
    authMock.mockResolvedValueOnce(session);

    const result = await verifySession();

    expect(result).toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("未ログイン(session が null)なら /login へリダイレクトする", async () => {
    authMock.mockResolvedValueOnce(null);

    await expect(verifySession()).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  test("session はあるが user が無ければ /login へリダイレクトする", async () => {
    authMock.mockResolvedValueOnce({});

    await expect(verifySession()).rejects.toBe(redirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
