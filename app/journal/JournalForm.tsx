"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { AccountOption } from "@/lib/journal/queries";
import type { JournalFormState, Pair, SideInput } from "@/lib/journal/form";

const emptySide = (): SideInput => ({
  accountId: "",
  subAccountId: "",
  amount: "",
});
const emptyPair = (): Pair => ({
  debit: emptySide(),
  credit: emptySide(),
});

// 今日の日付を YYYY-MM-DD で返す。
function todayString(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const inputClass =
  // w-full min-w-0: グリッド/フレックスのトラック幅に追従し、内容より小さくも縮めるようにする
  // （これが無いと select の最小幅で横にはみ出す）。
  "w-full min-w-0 rounded-lg border border-black/12 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-white/20 dark:text-zinc-50";

// 借方・貸方のうち片方ぶんの入力欄（科目・補助科目・金額）。
function SideFields({
  accounts,
  side,
  index,
  data,
  onChange,
}: {
  accounts: AccountOption[];
  side: "debit" | "credit";
  index: number;
  data: SideInput;
  onChange: (patch: Partial<SideInput>) => void;
}) {
  const account = accounts.find((a) => String(a.id) === data.accountId);
  const subAccounts = account?.subAccounts ?? [];
  return (
    // スマホは科目・補助・金額を縦積み、PC（sm 以上）は横並びにする。
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_6rem]">
      <select
        name={`${side}AccountId.${index}`}
        value={data.accountId}
        // 科目を変えたら補助科目はリセットする。
        onChange={(e) => onChange({ accountId: e.target.value, subAccountId: "" })}
        className={inputClass}
      >
        <option value="">科目</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <select
        name={`${side}SubAccountId.${index}`}
        value={data.subAccountId}
        onChange={(e) => onChange({ subAccountId: e.target.value })}
        disabled={subAccounts.length === 0}
        className={`${inputClass} disabled:opacity-40`}
      >
        <option value="">補助なし</option>
        {subAccounts.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <input
        name={`${side}Amount.${index}`}
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        placeholder="金額"
        value={data.amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        className={`${inputClass} text-right tabular-nums`}
      />
    </div>
  );
}

// 作成・編集の両方で使う。action と初期値を差し替えるだけで挙動を切り替える。
type JournalFormProps = {
  accounts: AccountOption[];
  // useActionState に渡す Server Action（作成 or 更新）。
  action: (
    prevState: JournalFormState | undefined,
    formData: FormData,
  ) => Promise<JournalFormState | undefined>;
  initialEntryDate?: string;
  initialDescription?: string;
  initialPairs?: Pair[];
  submitLabel?: string;
  cancelHref?: string;
};

export function JournalForm({
  accounts,
  action,
  initialEntryDate,
  initialDescription,
  initialPairs,
  submitLabel = "保存",
  cancelHref = "/",
}: JournalFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  // 編集時は既存明細から作った組を、新規時は空の 1 組から始める。
  const [pairs, setPairs] = useState<Pair[]>(initialPairs ?? [emptyPair()]);

  const updateSide = (
    index: number,
    side: "debit" | "credit",
    patch: Partial<SideInput>,
  ) => {
    setPairs((prev) =>
      prev.map((pair, i) =>
        i === index ? { ...pair, [side]: { ...pair[side], ...patch } } : pair,
      ),
    );
  };

  const addPair = () => setPairs((prev) => [...prev, emptyPair()]);

  const removePair = (index: number) => {
    // 最低 1 組は残す。
    setPairs((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev,
    );
  };

  // 入力中の借方・貸方合計（バランス表示用）。
  const toNumber = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const debitTotal = pairs.reduce((sum, p) => sum + toNumber(p.debit.amount), 0);
  const creditTotal = pairs.reduce(
    (sum, p) => sum + toNumber(p.credit.amount),
    0,
  );
  const balanced = debitTotal === creditTotal;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* 取引日（1）: 摘要（2） */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-1">
          <label
            htmlFor="entryDate"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            取引日
          </label>
          <input
            id="entryDate"
            name="entryDate"
            type="date"
            required
            defaultValue={initialEntryDate ?? todayString()}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor="description"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            摘要（任意）
          </label>
          <input
            id="description"
            name="description"
            type="text"
            placeholder="例: 現金売上"
            defaultValue={initialDescription}
            className={inputClass}
          />
        </div>
      </div>

      {/* 借方・貸方を左右に並べた明細 */}
      <div className="flex flex-col gap-2">
        <input type="hidden" name="pairCount" value={pairs.length} />

        {/* 借方 / 貸方 見出し */}
        <div className="flex items-center gap-3">
          <div className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            借方
          </div>
          <div className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            貸方
          </div>
          <div className="w-6" />
        </div>

        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SideFields
                accounts={accounts}
                side="debit"
                index={i}
                data={pair.debit}
                onChange={(patch) => updateSide(i, "debit", patch)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <SideFields
                accounts={accounts}
                side="credit"
                index={i}
                data={pair.credit}
                onChange={(patch) => updateSide(i, "credit", patch)}
              />
            </div>
            <button
              type="button"
              onClick={() => removePair(i)}
              disabled={pairs.length <= 1}
              aria-label="この行を削除"
              className="w-6 text-zinc-400 transition-colors hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addPair}
          className="self-start rounded-full border border-black/12 px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-black/4 dark:border-white/20 dark:text-zinc-50 dark:hover:bg-white/6"
        >
          明細を追加 +
        </button>
      </div>

      {/* バランス表示 */}
      <div className="flex items-center justify-end gap-4 text-sm tabular-nums">
        <span className="text-zinc-500 dark:text-zinc-400">
          借方 {yen(debitTotal)} / 貸方 {yen(creditTotal)}
        </span>
        <span
          className={
            balanced
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }
        >
          {balanced ? "貸借一致" : "不一致"}
        </span>
      </div>

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
