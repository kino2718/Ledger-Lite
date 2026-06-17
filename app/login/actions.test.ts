import { describe, expect, test, vi, beforeEach } from "vitest";

// signIn をモックする。@/auth 本体（NextAuth/Prisma）をロードせずに済む。
const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: signInMock }));

// next-auth のメインエントリは next/server に依存し vitest で解決できないため、
// エラークラスの実体がある @auth/core/errors に差し替える。actions.ts もこの
// モックを参照するので instanceof AuthError の判定も一致する。
vi.mock("next-auth", async () => {
  const errors = await import("@auth/core/errors");
  return {
    AuthError: errors.AuthError,
    CredentialsSignin: errors.CredentialsSignin,
  };
});

import { login } from "./actions";
import { AuthError, CredentialsSignin } from "next-auth";

// email/password を持つ FormData を組み立てるヘルパー。
function formData(email: string, password: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

describe("login action", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  test("メール形式が不正ならエラーを返し signIn を呼ばない", async () => {
    const result = await login(undefined, formData("not-an-email", "secret"));

    expect(result?.error).toBe("メールアドレスを正しく入力してください");
    expect(signInMock).not.toHaveBeenCalled();
  });

  test("パスワード未入力ならエラーを返し signIn を呼ばない", async () => {
    const result = await login(undefined, formData("alice@example.com", ""));

    expect(result?.error).toBe("パスワードを入力してください");
    expect(signInMock).not.toHaveBeenCalled();
  });

  test("検証OKなら credentials で signIn を呼ぶ", async () => {
    // 成功時は本来リダイレクト例外が飛ぶが、ここでは呼び出し内容だけ確認するため
    // resolve させておく。
    signInMock.mockResolvedValueOnce(undefined);

    await login(undefined, formData("alice@example.com", "secret"));

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "alice@example.com",
      password: "secret",
      redirectTo: "/",
    });
  });

  test("認証失敗(CredentialsSignin)は専用メッセージを返す", async () => {
    signInMock.mockRejectedValueOnce(new CredentialsSignin());

    const result = await login(undefined, formData("alice@example.com", "wrong"));

    expect(result?.error).toBe(
      "メールアドレスまたはパスワードが正しくありません",
    );
  });

  test("その他の AuthError は汎用メッセージを返す", async () => {
    signInMock.mockRejectedValueOnce(new AuthError("boom"));

    const result = await login(undefined, formData("alice@example.com", "secret"));

    expect(result?.error).toBe("ログインに失敗しました");
  });

  test("AuthError 以外（成功リダイレクト等）はそのまま再throwする", async () => {
    const redirectError = new Error("NEXT_REDIRECT");
    signInMock.mockRejectedValueOnce(redirectError);

    await expect(
      login(undefined, formData("alice@example.com", "secret")),
    ).rejects.toBe(redirectError);
  });
});
