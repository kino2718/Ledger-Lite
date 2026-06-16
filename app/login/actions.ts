"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

// ログインフォームの入力検証。zod 検証は auth.ts の authorize ではなく
// ここ（ログイン Server Action 側）に置く方針。
const schema = z.object({
  // zod v4 ではトップレベルの z.email() が推奨（文字列チェーンの .email() は非推奨）。
  email: z.email({ error: "メールアドレスを正しく入力してください" }),
  password: z.string().min(1, { error: "パスワードを入力してください" }),
});

export type LoginState = {
  error?: string;
};

// useActionState から呼ばれるため、第1引数に前回の state を受け取る。
// 成功時は signIn の redirectTo によりリダイレクト（NEXT_REDIRECT を throw）するため、
// 戻り値はエラー時のみ。正常系は undefined（= 何も返さず関数を抜ける）。
export async function login(
  _prevState: LoginState | undefined,
  formData: FormData,
): Promise<LoginState | undefined> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // 最初のエラーメッセージだけ表示する。
    return { error: parsed.error.issues[0]?.message ?? "入力が正しくありません" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // authorize が null を返した（照合失敗）場合は CredentialsSignin。
      if (error.type === "CredentialsSignin") {
        return { error: "メールアドレスまたはパスワードが正しくありません" };
      }
      return { error: "ログインに失敗しました" };
    }
    // signIn の成功リダイレクト（NEXT_REDIRECT）はここで再 throw する。
    throw error;
  }
}
