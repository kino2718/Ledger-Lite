import { describe, expect, test, vi } from "vitest";

// manage.ts は "server-only" を読み込むためテストでは空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import {
  createAccount,
  createSubAccount,
  deleteAccount,
  deleteSubAccount,
  updateAccount,
  updateSubAccount,
} from "@/lib/accounts/manage";
import type { AccountInput } from "@/lib/accounts/validation";

// テスト用のユーザーを用意する。
function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "hash" } });
}

// 正しい科目入力。上書きしたい項目だけ差し替えて使う。
function accountInput(overrides: Partial<AccountInput> = {}): AccountInput {
  return {
    code: "100",
    name: "現金",
    accountType: "asset",
    normalSide: "debit",
    isActive: true,
    ...overrides,
  };
}

// 科目を使用中にするため、その科目を含む最小の仕訳（相手科目つき）を作る。
async function seedEntryUsing(
  userId: number,
  accountId: number,
  subAccountId: number | null = null,
) {
  const counter = await prisma.account.create({
    data: {
      userId,
      code: "999",
      name: "相手科目",
      accountType: "revenue",
      normalSide: "credit",
    },
  });
  await prisma.journalEntry.create({
    data: {
      userId,
      entryDate: "2026-07-01",
      description: "使用中にする仕訳",
      lines: {
        create: [
          { lineNo: 1, accountId, subAccountId, side: "debit", amount: 1000 },
          { lineNo: 2, accountId: counter.id, side: "credit", amount: 1000 },
        ],
      },
    },
  });
}

describe("createAccount", () => {
  test("科目を作成できる（常に有効で作られる）", async () => {
    const alice = await createUser("alice@example.com");

    const result = await createAccount(
      alice.id,
      // 入力の isActive は見ない（false を渡しても有効で作られる）。
      accountInput({ isActive: false }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await prisma.account.findUnique({ where: { id: result.id } });
    expect(saved).toMatchObject({
      userId: alice.id,
      code: "100",
      name: "現金",
      accountType: "asset",
      normalSide: "debit",
      isActive: true,
    });
  });

  test("コード無し（null）でも作成できる", async () => {
    const alice = await createUser("alice@example.com");
    const result = await createAccount(alice.id, accountInput({ code: null }));
    expect(result.ok).toBe(true);
  });

  test("評価勘定（純資産で借方向き）も作成できる", async () => {
    const alice = await createUser("alice@example.com");
    const result = await createAccount(
      alice.id,
      accountInput({
        code: "300",
        name: "事業主貸",
        accountType: "equity",
        normalSide: "debit",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await prisma.account.findUnique({ where: { id: result.id } });
    expect(saved).toMatchObject({ accountType: "equity", normalSide: "debit" });
  });

  test("科目名が重複するとエラー", async () => {
    const alice = await createUser("alice@example.com");
    await createAccount(alice.id, accountInput());

    const result = await createAccount(
      alice.id,
      accountInput({ code: "101" }), // コードは違うが名前が同じ
    );

    expect(result).toEqual({
      ok: false,
      errors: ["この科目名は既に使われています。"],
    });
  });

  test("科目コードが重複するとエラー", async () => {
    const alice = await createUser("alice@example.com");
    await createAccount(alice.id, accountInput());

    const result = await createAccount(
      alice.id,
      accountInput({ name: "小口現金" }), // 名前は違うがコードが同じ
    );

    expect(result).toEqual({
      ok: false,
      errors: ["この科目コードは既に使われています。"],
    });
  });

  test("コード未設定（null）同士は重複にならない", async () => {
    const alice = await createUser("alice@example.com");
    await createAccount(alice.id, accountInput({ code: null }));
    const result = await createAccount(
      alice.id,
      accountInput({ code: null, name: "小口現金" }),
    );
    expect(result.ok).toBe(true);
  });

  test("別ユーザーとは重複してよい", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    await createAccount(alice.id, accountInput());

    const result = await createAccount(bob.id, accountInput());

    expect(result.ok).toBe(true);
  });

  test("入力が不正なら作成せずエラー（検証との結線確認）", async () => {
    const alice = await createUser("alice@example.com");
    const result = await createAccount(alice.id, accountInput({ name: "" }));
    expect(result.ok).toBe(false);
    expect(await prisma.account.count()).toBe(0);
  });
});

describe("updateAccount", () => {
  test("名前・コード・分類・向き・有効/無効を更新できる（未使用の科目）", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({
        code: "300",
        name: "事業主貸",
        accountType: "equity",
        normalSide: "debit",
        isActive: false,
      }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.account.findUnique({
      where: { id: created.id },
    });
    expect(saved).toMatchObject({
      code: "300",
      name: "事業主貸",
      accountType: "equity",
      normalSide: "debit",
      isActive: false,
    });
  });

  test("使用中の科目は分類を変更できない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await seedEntryUsing(alice.id, created.id);

    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({ accountType: "expense" }), // 資産 → 費用
    );

    expect(result).toEqual({
      ok: false,
      errors: ["仕訳で使用中の科目は、分類と通常残高の向きを変更できません。"],
    });
    const saved = await prisma.account.findUnique({
      where: { id: created.id },
    });
    expect(saved?.accountType).toBe("asset");
  });

  test("使用中の科目は通常残高の向きも変更できない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await seedEntryUsing(alice.id, created.id);

    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({ normalSide: "credit" }),
    );

    expect(result.ok).toBe(false);
  });

  test("使用中でも名前・コード・有効/無効は変更できる", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await seedEntryUsing(alice.id, created.id);

    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({ code: "110", name: "小口現金", isActive: false }),
    );

    expect(result.ok).toBe(true);
    const saved = await prisma.account.findUnique({
      where: { id: created.id },
    });
    expect(saved).toMatchObject({
      code: "110",
      name: "小口現金",
      isActive: false,
    });
  });

  test("他の科目とコード・名前が重複するとエラー", async () => {
    const alice = await createUser("alice@example.com");
    await createAccount(
      alice.id,
      accountInput({ code: "400", name: "売上高", accountType: "revenue", normalSide: "credit" }),
    );
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({ code: "400", name: "売上高" }),
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        "この科目コードは既に使われています。",
        "この科目名は既に使われています。",
      ],
    });
  });

  test("コード・名前が元のままの更新は重複扱いにならない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    // 有効/無効だけ切り替える（コード・名前は自分自身と同じ値のまま）。
    const result = await updateAccount(
      alice.id,
      created.id,
      accountInput({ isActive: false }),
    );

    expect(result.ok).toBe(true);
  });

  test("他ユーザーの科目は更新できない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await updateAccount(
      bob.id,
      created.id,
      accountInput({ name: "乗っ取り" }),
    );

    expect(result).toEqual({
      ok: false,
      errors: ["対象の科目が見つかりません。"],
    });
    const saved = await prisma.account.findUnique({
      where: { id: created.id },
    });
    expect(saved?.name).toBe("現金");
  });

  test("存在しない ID はエラー", async () => {
    const alice = await createUser("alice@example.com");
    const result = await updateAccount(alice.id, 9999, accountInput());
    expect(result.ok).toBe(false);
  });
});

describe("deleteAccount", () => {
  test("未使用の科目は削除できる", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await deleteAccount(alice.id, created.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.account.count()).toBe(0);
  });

  test("仕訳で使用中の科目は削除できない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await seedEntryUsing(alice.id, created.id);

    const result = await deleteAccount(alice.id, created.id);

    expect(result).toEqual({
      ok: false,
      errors: ["仕訳で使用中の科目は削除できません。無効化してください。"],
    });
    expect(
      await prisma.account.findUnique({ where: { id: created.id } }),
    ).not.toBeNull();
  });

  test("補助科目がある科目は削除できない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await createSubAccount(alice.id, created.id, "電気");

    const result = await deleteAccount(alice.id, created.id);

    expect(result).toEqual({
      ok: false,
      errors: ["補助科目がある科目は削除できません。"],
    });
  });

  test("他ユーザーの科目は削除できない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await deleteAccount(bob.id, created.id);

    expect(result.ok).toBe(false);
    expect(await prisma.account.count()).toBe(1);
  });
});

describe("createSubAccount", () => {
  test("補助科目を作成できる（有効で作られる）", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await createSubAccount(alice.id, created.id, "電気");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await prisma.subAccount.findUnique({
      where: { id: result.id },
    });
    expect(saved).toMatchObject({
      accountId: created.id,
      name: "電気",
      isActive: true,
    });
  });

  test("名前の前後の空白は取り除いて保存する", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await createSubAccount(alice.id, created.id, " 電気 ");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = await prisma.subAccount.findUnique({
      where: { id: result.id },
    });
    expect(saved?.name).toBe("電気");
  });

  test("同じ科目内で名前が重複するとエラー", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    await createSubAccount(alice.id, created.id, "電気");

    const result = await createSubAccount(alice.id, created.id, "電気");

    expect(result).toEqual({
      ok: false,
      errors: ["この補助科目名は既に使われています。"],
    });
  });

  test("別の科目となら同名でもよい", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createAccount(alice.id, accountInput());
    const b = await createAccount(
      alice.id,
      accountInput({ code: "101", name: "普通預金" }),
    );
    if (!a.ok || !b.ok) throw new Error("seed に失敗");
    await createSubAccount(alice.id, a.id, "メイン");

    const result = await createSubAccount(alice.id, b.id, "メイン");

    expect(result.ok).toBe(true);
  });

  test("名前が空ならエラー", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await createSubAccount(alice.id, created.id, "  ");

    expect(result.ok).toBe(false);
    expect(await prisma.subAccount.count()).toBe(0);
  });

  test("他ユーザーの科目には作成できない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");

    const result = await createSubAccount(bob.id, created.id, "電気");

    expect(result).toEqual({
      ok: false,
      errors: ["対象の科目が見つかりません。"],
    });
  });
});

describe("updateSubAccount", () => {
  // 補助科目つきの科目を用意する共通セットアップ。
  async function setupWithSub() {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    const sub = await createSubAccount(alice.id, created.id, "電気");
    if (!sub.ok) throw new Error("seed に失敗");
    return { alice, accountId: created.id, subId: sub.id };
  }

  test("名前と有効/無効を更新できる", async () => {
    const { alice, subId } = await setupWithSub();

    const result = await updateSubAccount(alice.id, subId, {
      name: "ガス",
      isActive: false,
    });

    expect(result.ok).toBe(true);
    const saved = await prisma.subAccount.findUnique({ where: { id: subId } });
    expect(saved).toMatchObject({ name: "ガス", isActive: false });
  });

  test("同じ科目内の別の補助科目と名前が重複するとエラー", async () => {
    const { alice, accountId, subId } = await setupWithSub();
    await createSubAccount(alice.id, accountId, "水道");

    const result = await updateSubAccount(alice.id, subId, {
      name: "水道",
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      errors: ["この補助科目名は既に使われています。"],
    });
  });

  test("名前が元のままの更新（有効/無効の切替）は重複扱いにならない", async () => {
    const { alice, subId } = await setupWithSub();

    const result = await updateSubAccount(alice.id, subId, {
      name: "電気",
      isActive: false,
    });

    expect(result.ok).toBe(true);
  });

  test("他ユーザーの補助科目は更新できない", async () => {
    const { subId } = await setupWithSub();
    const bob = await createUser("bob@example.com");

    const result = await updateSubAccount(bob.id, subId, {
      name: "乗っ取り",
      isActive: true,
    });

    expect(result).toEqual({
      ok: false,
      errors: ["対象の補助科目が見つかりません。"],
    });
  });
});

describe("deleteSubAccount", () => {
  test("未使用の補助科目は削除できる", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    const sub = await createSubAccount(alice.id, created.id, "電気");
    if (!sub.ok) throw new Error("seed に失敗");

    const result = await deleteSubAccount(alice.id, sub.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.subAccount.count()).toBe(0);
  });

  test("仕訳で使用中の補助科目は削除できない", async () => {
    const alice = await createUser("alice@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    const sub = await createSubAccount(alice.id, created.id, "電気");
    if (!sub.ok) throw new Error("seed に失敗");
    await seedEntryUsing(alice.id, created.id, sub.id);

    const result = await deleteSubAccount(alice.id, sub.id);

    expect(result).toEqual({
      ok: false,
      errors: ["仕訳で使用中の補助科目は削除できません。無効化してください。"],
    });
    expect(await prisma.subAccount.count()).toBe(1);
  });

  test("他ユーザーの補助科目は削除できない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const created = await createAccount(alice.id, accountInput());
    if (!created.ok) throw new Error("seed に失敗");
    const sub = await createSubAccount(alice.id, created.id, "電気");
    if (!sub.ok) throw new Error("seed に失敗");

    const result = await deleteSubAccount(bob.id, sub.id);

    expect(result.ok).toBe(false);
    expect(await prisma.subAccount.count()).toBe(1);
  });
});
