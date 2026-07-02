"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { normalBalanceSide } from "@/lib/ledger/balance";
import { ACCOUNT_TYPE_LABEL, SIDE_LABEL } from "@/lib/ledger/types";
import type { AccountType, Side } from "@/lib/ledger/types";
import type { AccountFormState } from "@/lib/accounts/form";

const inputClass =
  "w-full min-w-0 rounded-lg border border-black/12 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-white/20 dark:text-zinc-50";

// select の選択肢に使う分類の並び（貸借対照表→損益計算書の順）。
const ACCOUNT_TYPES: readonly AccountType[] = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
];

// 作成・編集の両方で使う。action と初期値を差し替えるだけで挙動を切り替える。
type AccountFormProps = {
  // useActionState に渡す Server Action（作成 or 更新）。
  action: (
    prevState: AccountFormState | undefined,
    formData: FormData,
  ) => Promise<AccountFormState | undefined>;
  initialCode?: string;
  initialName?: string;
  initialAccountType?: AccountType;
  initialNormalSide?: Side;
  initialIsActive?: boolean;
  // 編集時のみ true。有効/無効のチェックボックスを出す。
  showIsActive?: boolean;
  // 仕訳で使用中の科目は分類・向きを変更できない（サーバー側でも拒否する）。
  inUse?: boolean;
  submitLabel?: string;
  cancelHref?: string;
};

// 既知の難: React は form action の完了後にフォームを自動リセットするため、
// 検証エラーで戻ってきたとき入力値が画面から消える（uncontrolled な科目名・
// コードは空に戻り、controlled な select・radio も「見た目だけ」既定に戻る）。
// 値を保持するには全フィールドを controlled にし、リセット後に DOM を state へ
// 同期し直す対応が要るが、煩わしくなったら直す方針でいまは対応しない。
export function AccountForm({
  action,
  initialCode = "",
  initialName = "",
  initialAccountType = "asset",
  initialNormalSide,
  initialIsActive = true,
  showIsActive = false,
  inUse = false,
  submitLabel = "保存",
  cancelHref = "/accounts",
}: AccountFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  // 分類と向きは連動する（分類を変えると向きが既定に戻る）ため state で持つ。
  const [accountType, setAccountType] = useState<AccountType>(
    initialAccountType,
  );
  const [normalSide, setNormalSide] = useState<Side>(
    initialNormalSide ?? normalBalanceSide(initialAccountType),
  );

  const changeType = (value: AccountType) => {
    setAccountType(value);
    // 向きはその分類の既定に合わせ直す。評価勘定にしたい場合はこの後 radio で変える。
    setNormalSide(normalBalanceSide(value));
  };

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* 科目名（2）: コード（1） */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor="name"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            科目名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="例: 通信費"
            defaultValue={initialName}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label
            htmlFor="code"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            科目コード（任意）
          </label>
          <input
            id="code"
            name="code"
            type="text"
            placeholder="例: 510"
            defaultValue={initialCode}
            className={`${inputClass} tabular-nums`}
          />
        </div>
      </div>

      {/* 分類と通常残高の向き */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label
            htmlFor="accountType"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            分類
          </label>
          <select
            id="accountType"
            name="accountType"
            value={accountType}
            onChange={(e) => changeType(e.target.value as AccountType)}
            disabled={inUse}
            className={`${inputClass} disabled:opacity-40`}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            通常残高の向き
          </span>
          <div className="flex h-full items-center gap-4">
            {(["debit", "credit"] as const).map((side) => (
              <label
                key={side}
                className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="radio"
                  name="normalSide"
                  value={side}
                  checked={normalSide === side}
                  onChange={() => setNormalSide(side)}
                  disabled={inUse}
                  className="accent-black dark:accent-zinc-50"
                />
                {SIDE_LABEL[side]}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* disabled のコントロールは送信されないため、使用中は hidden で値を送る。 */}
      {inUse && (
        <>
          <input type="hidden" name="accountType" value={accountType} />
          <input type="hidden" name="normalSide" value={normalSide} />
        </>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {inUse
          ? "仕訳で使用中のため、分類と通常残高の向きは変更できません。"
          : "向きは分類から自動で決まります。事業主貸（純資産だが借方に積み上がる）のような評価勘定を作るときだけ手動で変えてください。"}
      </p>

      {/* 有効/無効（編集時のみ） */}
      {showIsActive && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initialIsActive}
            className="accent-black dark:accent-zinc-50"
          />
          有効（チェックを外すと、新しい仕訳の科目として選べなくなります）
        </label>
      )}

      {/* エラー表示 */}
      {state?.errors && state.errors.length > 0 && (
        <ul
          aria-live="polite"
          className="flex flex-col gap-1 rounded-lg border border-red-600/30 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {/* 操作 */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-black px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
