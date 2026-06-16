import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// 保護ページの先頭で呼ぶ。未ログインなら /login へリダイレクトし、
// ログイン済みならセッションを返す。データに最も近いサーバー側で守る
// （= Secure チェック）ための集約関数。
//
// cache() で 1 リクエスト内の呼び出しをメモ化し、複数箇所から呼んでも
// auth() が一度しか走らないようにする。
export const verifySession = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
});
