import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountForEdit } from "@/lib/accounts/queries";
import { AccountForm } from "../../AccountForm";
import { DeleteAccountButton } from "../../DeleteAccountButton";
import { deleteAccountAction, updateAccountAction } from "./actions";

export default async function EditAccountPage({
  params,
}: {
  // この版では動的セグメントは Promise で渡るため await して取り出す。
  params: Promise<{ accountId: string }>;
}) {
  const { accountId: idParam } = await params;
  const accountId = Number(idParam);
  // 数値以外の URL（/accounts/abc/edit など）は 404 に倒す。
  if (!Number.isInteger(accountId)) notFound();

  const session = await verifySession();
  const userId = Number(session.user.id);

  const account = await getAccountForEdit(userId, accountId);
  // 他ユーザーの科目や存在しない ID は null → 404。
  if (!account) notFound();

  // 削除できるのは未使用（仕訳の明細ゼロ・補助科目ゼロ）のときだけ。
  const deletable = !account.inUse && account.subAccounts.length === 0;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-black/8 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
            科目の編集
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
        <AccountForm
          // 対象 ID を結び付けた更新アクションを渡す。
          action={updateAccountAction.bind(null, account.id)}
          initialCode={account.code ?? undefined}
          initialName={account.name}
          initialAccountType={account.accountType}
          initialNormalSide={account.normalSide}
          initialIsActive={account.isActive}
          showIsActive
          inUse={account.inUse}
          submitLabel="更新"
        />

        {/* 削除はフォームと独立した操作なので、区切って下部に配置する。 */}
        <div className="mt-8 flex items-center justify-between gap-4 border-t border-black/8 pt-6 dark:border-white/10">
          {deletable ? (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                この科目は未使用のため削除できます。
              </p>
              {/* 対象 ID を結び付けた削除アクションを渡す。 */}
              <DeleteAccountButton
                action={deleteAccountAction.bind(null, account.id)}
              />
            </>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              仕訳で使用中か補助科目がある科目は削除できません。使わなくなった科目は
              「有効」のチェックを外して無効化してください。
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
