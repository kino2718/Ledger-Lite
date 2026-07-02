import Link from "next/link";
import { verifySession } from "@/lib/session";
import { AccountForm } from "../AccountForm";
import { createAccountAction } from "./actions";

export default async function NewAccountPage() {
  await verifySession();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            新規科目
          </h1>
          <Link
            href="/accounts"
            className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← 科目管理
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <AccountForm action={createAccountAction} submitLabel="作成" />
      </main>
    </div>
  );
}
