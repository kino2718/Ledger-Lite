// 勘定科目・補助科目の保存・更新・削除処理（書き込み）。検証を通った場合のみ DB へ反映する。
// 入力単体の検証は validation.ts に委ね、ここは「所有確認→重複チェック→保存」を束ねる。
//
// マスタの削除方針: 仕訳で使用中（明細あり）の科目・補助科目は削除せず isActive=false で
// 無効化する。未使用（明細ゼロ、科目は補助科目もゼロ）のものだけ物理削除できる。
import "server-only";
import { prisma } from "@/lib/prisma";
import { validateAccountInput, validateSubAccountName } from "./validation";
import type { AccountInput } from "./validation";

export type SaveAccountResult =
  | { ok: true; id: number }
  | { ok: false; errors: string[] };

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/**
 * 勘定科目を検証して作成する。コード・科目名がユーザー内で重複するとエラー。
 * 新規作成する科目は常に有効（isActive=true）とし、input の isActive は見ない。
 */
export async function createAccount(
  userId: number,
  input: AccountInput,
): Promise<SaveAccountResult> {
  const errors: string[] = [];

  const basic = validateAccountInput(input);
  if (!basic.ok) errors.push(...basic.errors);

  errors.push(...(await collectDuplicateErrors(userId, input)));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const account = await prisma.account.create({
    data: {
      userId,
      code: input.code,
      name: input.name,
      accountType: input.accountType,
      normalSide: input.normalSide,
      isActive: true,
    },
  });

  return { ok: true, id: account.id };
}

/**
 * 勘定科目を検証して更新する。所有者の科目でなければエラー。
 * 仕訳で使用中の科目は、過去の帳簿・損益がさかのぼって変わってしまうため
 * 分類（accountType）と通常残高の向き（normalSide）を変更できない。
 */
export async function updateAccount(
  userId: number,
  id: number,
  input: AccountInput,
): Promise<SaveAccountResult> {
  const errors: string[] = [];

  const basic = validateAccountInput(input);
  if (!basic.ok) errors.push(...basic.errors);

  // 対象が存在し、かつこのユーザーの所有であることを確認する。
  const existing = await prisma.account.findFirst({
    where: { id, userId },
    select: {
      accountType: true,
      normalSide: true,
      _count: { select: { journalLines: true } },
    },
  });
  if (!existing) {
    return { ok: false, errors: ["対象の科目が見つかりません。"] };
  }

  // 使用中（仕訳の明細あり）なら分類・向きの変更を拒否する。
  const inUse = existing._count.journalLines > 0;
  const typeChanged =
    input.accountType !== existing.accountType ||
    input.normalSide !== existing.normalSide;
  if (inUse && typeChanged) {
    errors.push("仕訳で使用中の科目は、分類と通常残高の向きを変更できません。");
  }

  // 重複チェックは自分自身を除いて行う。
  errors.push(...(await collectDuplicateErrors(userId, input, id)));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  await prisma.account.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      accountType: input.accountType,
      normalSide: input.normalSide,
      isActive: input.isActive,
    },
  });

  return { ok: true, id };
}

/**
 * 勘定科目を物理削除する。未使用（仕訳の明細ゼロ・補助科目ゼロ）のときだけ削除できる。
 * 使用中の科目は isActive=false での無効化（updateAccount）で対応する。
 */
export async function deleteAccount(
  userId: number,
  id: number,
): Promise<DeleteAccountResult> {
  const existing = await prisma.account.findFirst({
    where: { id, userId },
    select: {
      _count: { select: { journalLines: true, subAccounts: true } },
    },
  });
  if (!existing) {
    return { ok: false, errors: ["対象の科目が見つかりません。"] };
  }

  const errors: string[] = [];
  if (existing._count.journalLines > 0) {
    errors.push("仕訳で使用中の科目は削除できません。無効化してください。");
  }
  if (existing._count.subAccounts > 0) {
    errors.push("補助科目がある科目は削除できません。");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  await prisma.account.delete({ where: { id } });
  return { ok: true };
}

// コード・科目名の重複を調べてエラーを返す（空なら重複なし）。
// excludeId は更新時に自分自身を重複扱いしないための除外 ID。
// 一意性は userId 単位なので他ユーザーとは衝突しない。競合し得るのは同一ユーザーの
// 同時送信（ダブルクリック・複数タブ等）だけで、ローカル利用ではまず起きないため
// 事前チェックで足りる（起きても DB の @@unique が最終防衛線として拒否する）。
async function collectDuplicateErrors(
  userId: number,
  input: AccountInput,
  excludeId?: number,
): Promise<string[]> {
  const errors: string[] = [];
  const notSelf = excludeId === undefined ? {} : { id: { not: excludeId } };

  if (input.code !== null) {
    const sameCode = await prisma.account.findFirst({
      where: { userId, code: input.code, ...notSelf },
      select: { id: true },
    });
    if (sameCode) errors.push("この科目コードは既に使われています。");
  }

  if (input.name !== "") {
    const sameName = await prisma.account.findFirst({
      where: { userId, name: input.name, ...notSelf },
      select: { id: true },
    });
    if (sameName) errors.push("この科目名は既に使われています。");
  }

  return errors;
}

/**
 * 補助科目を検証して作成する。親の勘定科目が所有者のものでなければエラー。
 * 同一の勘定科目内で補助科目名が重複するとエラー。
 */
export async function createSubAccount(
  userId: number,
  accountId: number,
  name: string,
): Promise<SaveAccountResult> {
  const trimmed = name.trim();
  const basic = validateSubAccountName(trimmed);
  if (!basic.ok) {
    return { ok: false, errors: basic.errors };
  }

  // 親科目の所有確認。
  const parent = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!parent) {
    return { ok: false, errors: ["対象の科目が見つかりません。"] };
  }

  const duplicate = await prisma.subAccount.findFirst({
    where: { accountId, name: trimmed },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, errors: ["この補助科目名は既に使われています。"] };
  }

  const sub = await prisma.subAccount.create({
    data: { accountId, name: trimmed },
  });
  return { ok: true, id: sub.id };
}

/**
 * 補助科目の名前・有効/無効を更新する。所有確認は親の勘定科目経由で行う。
 */
export async function updateSubAccount(
  userId: number,
  subAccountId: number,
  input: { name: string; isActive: boolean },
): Promise<SaveAccountResult> {
  const trimmed = input.name.trim();
  const basic = validateSubAccountName(trimmed);
  if (!basic.ok) {
    return { ok: false, errors: basic.errors };
  }

  const existing = await prisma.subAccount.findFirst({
    where: { id: subAccountId, account: { userId } },
    select: { accountId: true },
  });
  if (!existing) {
    return { ok: false, errors: ["対象の補助科目が見つかりません。"] };
  }

  // 同じ勘定科目内での名前重複を、自分自身を除いて調べる。
  const duplicate = await prisma.subAccount.findFirst({
    where: {
      accountId: existing.accountId,
      name: trimmed,
      id: { not: subAccountId },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, errors: ["この補助科目名は既に使われています。"] };
  }

  await prisma.subAccount.update({
    where: { id: subAccountId },
    data: { name: trimmed, isActive: input.isActive },
  });
  return { ok: true, id: subAccountId };
}

/**
 * 補助科目を物理削除する。未使用（仕訳の明細ゼロ）のときだけ削除できる。
 */
export async function deleteSubAccount(
  userId: number,
  subAccountId: number,
): Promise<DeleteAccountResult> {
  const existing = await prisma.subAccount.findFirst({
    where: { id: subAccountId, account: { userId } },
    select: { _count: { select: { journalLines: true } } },
  });
  if (!existing) {
    return { ok: false, errors: ["対象の補助科目が見つかりません。"] };
  }

  if (existing._count.journalLines > 0) {
    return {
      ok: false,
      errors: ["仕訳で使用中の補助科目は削除できません。無効化してください。"],
    };
  }

  await prisma.subAccount.delete({ where: { id: subAccountId } });
  return { ok: true };
}
