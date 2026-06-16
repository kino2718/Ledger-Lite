import { signOut } from "@/auth";
import { verifySession } from "@/lib/session";

export default async function Home() {
  // 未ログインなら /login へリダイレクトされる（ここから先は必ずログイン済み）。
  const session = await verifySession();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <main className="w-full max-w-sm rounded-2xl border border-black/8 bg-white p-8 shadow-sm dark:border-white/14.5 dark:bg-zinc-950">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Ledger Lite
        </h1>

        <div className="flex flex-col gap-4">
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <p>ログイン中です。</p>
            <p className="mt-2">
              <span className="text-zinc-500 dark:text-zinc-400">名前: </span>
              {session.user.name ?? "(未設定)"}
            </p>
            <p>
              <span className="text-zinc-500 dark:text-zinc-400">メール: </span>
              {session.user.email}
            </p>
            <p>
              <span className="text-zinc-500 dark:text-zinc-400">ID: </span>
              {session.user.id}
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="h-11 w-full rounded-full border border-black/12 text-sm font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
            >
              ログアウト
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
