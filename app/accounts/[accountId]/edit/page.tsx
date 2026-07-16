import Link from "next/link";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/session";
import { getAccountForEdit } from "@/lib/accounts/queries";
import { AccountForm } from "../../AccountForm";
import { DeleteButton } from "@/app/components/DeleteButton";
import { SubAccountItem } from "../../SubAccountItem";
import { AddSubAccountForm } from "../../AddSubAccountForm";
import {
  addSubAccountAction,
  deleteAccountAction,
  deleteSubAccountAction,
  updateAccountAction,
  updateSubAccountAction,
} from "./actions";

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

        {/* 補助科目の管理。追加・改名・有効/無効・削除はこのページ内で完結する。 */}
        <section className="mt-8 border-t border-black/8 pt-6 dark:border-white/10">
          <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            補助科目
          </h2>
          {account.subAccounts.length > 0 && (
            <ul className="mb-4 overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950">
              {account.subAccounts.map((sub) => (
                <SubAccountItem
                  key={sub.id}
                  name={sub.name}
                  isActive={sub.isActive}
                  inUse={sub.inUse}
                  // 対象 ID を結び付けたアクションを行ごとに渡す。
                  // accountId は成功後にこのページを再描画するために使う。
                  updateAction={updateSubAccountAction.bind(
                    null,
                    account.id,
                    sub.id,
                  )}
                  deleteAction={deleteSubAccountAction.bind(
                    null,
                    account.id,
                    sub.id,
                  )}
                />
              ))}
            </ul>
          )}
          <AddSubAccountForm
            action={addSubAccountAction.bind(null, account.id)}
          />
          <p className="mt-3 text-xs text-zinc-400">
            補助科目は、取引先ごとの内訳など、科目をさらに細かく分けたいときに
            使います。仕訳で使用中の補助科目は削除できません（「有効」を外して
            無効化すると、新しい仕訳の選択肢から消えます）。
          </p>
        </section>

        {/* 削除はフォームと独立した操作なので、区切って下部に配置する。 */}
        <div className="mt-8 flex items-center justify-between gap-4 border-t border-black/8 pt-6 dark:border-white/10">
          {deletable ? (
            <>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                この科目は未使用のため削除できます。
              </p>
              {/* 対象 ID を結び付けた削除アクションを渡す。 */}
              <DeleteButton
                action={deleteAccountAction.bind(null, account.id)}
                confirmMessage="この科目を削除します。元に戻せません。よろしいですか？"
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
