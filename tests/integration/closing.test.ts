import { describe, expect, test, vi } from "vitest";

// closing 配下は "server-only" を読み込む（クライアントへのバンドル防止）。
// テスト環境では例外になるため空モックに差し替える。
vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/prisma";
import { closeYear, reopenYear } from "@/lib/closing/manage";
import { getAggregationStart, getYearClosings } from "@/lib/closing/queries";
import { deleteJournalEntry } from "@/lib/journal/create";
import { getBalanceLines } from "@/lib/journal/queries";
import { computeAccountBalances, normalBalanceSide } from "@/lib/ledger/balance";
import type { AccountType, Side } from "@/lib/ledger/types";

// --- テスト用のデータ作成ヘルパー --------------------------------------------

function createUser(email: string) {
  return prisma.user.create({ data: { email, passwordHash: "hash" } });
}

function createAccount(
  userId: number,
  code: string,
  name: string,
  accountType: AccountType,
  normalSide: Side = normalBalanceSide(accountType),
) {
  return prisma.account.create({
    data: { userId, code, name, accountType, normalSide },
  });
}

function createEntry(
  userId: number,
  entryDate: string,
  description: string | null,
  lines: {
    accountId: number;
    subAccountId?: number | null;
    side: Side;
    amount: number;
  }[],
) {
  return prisma.journalEntry.create({
    data: {
      userId,
      entryDate,
      description,
      lines: {
        create: lines.map((line, i) => ({ lineNo: i + 1, ...line })),
      },
    },
  });
}

// 標準の科目セットを作る（事業主貸は借方残高の評価勘定）。
async function createStandardAccounts(userId: number) {
  return {
    bank: await createAccount(userId, "101", "普通預金", "asset"),
    draw: await createAccount(userId, "300", "事業主貸", "equity", "debit"),
    ownerLoan: await createAccount(userId, "301", "事業主借", "equity"),
    capital: await createAccount(userId, "302", "元入金", "equity"),
    sales: await createAccount(userId, "400", "売上高", "revenue"),
    telecom: await createAccount(userId, "500", "通信費", "expense"),
  };
}

// 2025 年の標準的な 1 年分の仕訳。
// 年末残高: 普通預金 1,004,000・事業主貸 150,000・事業主借 3,000・
// 元入金 1,000,000・損益 +151,000（売上 200,000 − 費用 49,000）。
// 新元入金 ＝ 1,000,000 ＋ 3,000 − 150,000 ＋ 151,000 ＝ 1,004,000。
async function seed2025(
  userId: number,
  a: Awaited<ReturnType<typeof createStandardAccounts>>,
) {
  await createEntry(userId, "2025-06-01", "開業", [
    { accountId: a.bank.id, side: "debit", amount: 1000000 },
    { accountId: a.capital.id, side: "credit", amount: 1000000 },
  ]);
  await createEntry(userId, "2025-07-01", "売上", [
    { accountId: a.bank.id, side: "debit", amount: 200000 },
    { accountId: a.sales.id, side: "credit", amount: 200000 },
  ]);
  await createEntry(userId, "2025-08-01", "通信費", [
    { accountId: a.telecom.id, side: "debit", amount: 46000 },
    { accountId: a.bank.id, side: "credit", amount: 46000 },
  ]);
  await createEntry(userId, "2025-09-01", "生活費", [
    { accountId: a.draw.id, side: "debit", amount: 150000 },
    { accountId: a.bank.id, side: "credit", amount: 150000 },
  ]);
  await createEntry(userId, "2025-10-01", "経費の立替", [
    { accountId: a.telecom.id, side: "debit", amount: 3000 },
    { accountId: a.ownerLoan.id, side: "credit", amount: 3000 },
  ]);
}

// --- closeYear ----------------------------------------------------------------

describe("closeYear", () => {
  test("翌年 1/1 付の繰越仕訳を生成する（元入金の振替式・事業主貸借と損益は含めない）", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);

    const result = await closeYear(alice.id, 2025);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    // 繰越仕訳: 借方 普通預金 1,004,000 ／ 貸方 元入金 1,004,000。
    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.openingEntryId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(entry).toMatchObject({
      userId: alice.id,
      entryDate: "2026-01-01",
      description: "前期繰越",
    });
    expect(entry?.lines).toHaveLength(2);
    expect(entry?.lines[0]).toMatchObject({
      accountId: a.bank.id,
      side: "debit",
      amount: 1004000,
    });
    expect(entry?.lines[1]).toMatchObject({
      accountId: a.capital.id,
      side: "credit",
      amount: 1004000,
    });

    // YearClosing に記録される。
    const closings = await getYearClosings(alice.id);
    expect(closings).toHaveLength(1);
    expect(closings[0]).toMatchObject({
      year: 2025,
      openingEntryId: result.openingEntryId,
    });
  });

  test("締め後は繰越仕訳の日付から集計すれば二重計上にならない", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);
    await closeYear(alice.id, 2025);

    // 2026 年の取引を 1 件追加。
    await createEntry(alice.id, "2026-02-01", "売上", [
      { accountId: a.bank.id, side: "debit", amount: 30000 },
      { accountId: a.sales.id, side: "credit", amount: 30000 },
    ]);

    // 集計開始日は繰越仕訳の日付になる。
    const start = await getAggregationStart(alice.id, 2026);
    expect(start).toBe("2026-01-01");

    // 開始日以降の集計: 繰越仕訳＋2026 年の取引だけが乗る。
    const lines = await getBalanceLines(alice.id, { from: start });
    const balances = new Map(
      computeAccountBalances(lines).map((b) => [b.accountId, b.balance]),
    );
    expect(balances.get(a.bank.id)).toBe(1034000); // 1,004,000 ＋ 30,000
    expect(balances.get(a.capital.id)).toBe(1004000); // 振替後の元入金
    expect(balances.get(a.sales.id)).toBe(30000); // 前年の売上を含まない
    expect(balances.has(a.draw.id)).toBe(false); // 事業主貸はゼロスタート
    expect(balances.has(a.ownerLoan.id)).toBe(false);
  });

  test("古い年から順にしか締められない", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await createEntry(alice.id, "2024-05-01", "開業", [
      { accountId: a.bank.id, side: "debit", amount: 100000 },
      { accountId: a.capital.id, side: "credit", amount: 100000 },
    ]);
    await createEntry(alice.id, "2025-03-01", "売上", [
      { accountId: a.bank.id, side: "debit", amount: 50000 },
      { accountId: a.sales.id, side: "credit", amount: 50000 },
    ]);

    // 2024 年より先に 2025 年は締められない。
    const early = await closeYear(alice.id, 2025);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.errors[0]).toContain("2024");

    // 2024 → 2025 の順なら締められ、2025 年の繰越は前年の繰越の上に積み上がる。
    expect((await closeYear(alice.id, 2024)).ok).toBe(true);
    const result = await closeYear(alice.id, 2025);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.openingEntryId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(entry?.entryDate).toBe("2026-01-01");
    // 普通預金 150,000（前年繰越 100,000 ＋ 売上 50,000）。二重計上されない。
    expect(entry?.lines[0]).toMatchObject({
      accountId: a.bank.id,
      side: "debit",
      amount: 150000,
    });
    expect(entry?.lines[1]).toMatchObject({
      accountId: a.capital.id,
      side: "credit",
      amount: 150000,
    });
  });

  test("同じ年は二度締められない", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);
    await closeYear(alice.id, 2025);

    const again = await closeYear(alice.id, 2025);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.errors[0]).toContain("すでに");
  });

  test("まだ終わっていない年（今年以降）は締められない", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);

    const thisYear = new Date().getFullYear();
    const result = await closeYear(alice.id, thisYear);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("まだ終わっていない");
  });

  test("「元入金」の科目が無いと締められない", async () => {
    const alice = await createUser("alice@example.com");
    const bank = await createAccount(alice.id, "101", "普通預金", "asset");
    const sales = await createAccount(alice.id, "400", "売上高", "revenue");
    await createEntry(alice.id, "2025-03-01", "売上", [
      { accountId: bank.id, side: "debit", amount: 50000 },
      { accountId: sales.id, side: "credit", amount: 50000 },
    ]);

    const result = await closeYear(alice.id, 2025);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("元入金");
  });

  test("補助科目ごとの残高は補助科目つきで繰り越す", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    const subA = await prisma.subAccount.create({
      data: { accountId: a.bank.id, name: "銀行A" },
    });
    const subB = await prisma.subAccount.create({
      data: { accountId: a.bank.id, name: "銀行B" },
    });
    await createEntry(alice.id, "2025-06-01", "開業", [
      { accountId: a.bank.id, subAccountId: subA.id, side: "debit", amount: 60000 },
      { accountId: a.bank.id, subAccountId: subB.id, side: "debit", amount: 40000 },
      { accountId: a.capital.id, side: "credit", amount: 100000 },
    ]);

    const result = await closeYear(alice.id, 2025);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.openingEntryId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(entry?.lines).toHaveLength(3);
    expect(entry?.lines[0]).toMatchObject({
      accountId: a.bank.id,
      subAccountId: subA.id,
      side: "debit",
      amount: 60000,
    });
    expect(entry?.lines[1]).toMatchObject({
      accountId: a.bank.id,
      subAccountId: subB.id,
      side: "debit",
      amount: 40000,
    });
    expect(entry?.lines[2]).toMatchObject({
      accountId: a.capital.id,
      subAccountId: null,
      side: "credit",
      amount: 100000,
    });
  });

  test("全残高が 0 の年は明細 0 行の繰越仕訳で締められる", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    // 年末に全科目の残高が 0 になる年:
    // 事業主借で 10,000 受け入れ → 全額を通信費で支出。
    // 損益 −10,000 ＋ 事業主借 10,000 ＝ 新元入金 0。繰り越す行が無い。
    await createEntry(alice.id, "2024-04-01", "経費資金の受け入れ", [
      { accountId: a.bank.id, side: "debit", amount: 10000 },
      { accountId: a.ownerLoan.id, side: "credit", amount: 10000 },
    ]);
    await createEntry(alice.id, "2024-05-01", "通信費", [
      { accountId: a.telecom.id, side: "debit", amount: 10000 },
      { accountId: a.bank.id, side: "credit", amount: 10000 },
    ]);

    const result = await closeYear(alice.id, 2024);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    // 繰越仕訳自体は作られるが、明細は 0 行。
    const entry = await prisma.journalEntry.findUnique({
      where: { id: result.openingEntryId },
      include: { lines: true },
    });
    expect(entry).toMatchObject({
      entryDate: "2025-01-01",
      description: "前期繰越",
    });
    expect(entry?.lines).toHaveLength(0);

    // 集計起点は切り替わり、締めの連鎖も止まらない（翌年も締められる）。
    expect(await getAggregationStart(alice.id, 2025)).toBe("2025-01-01");
    await createEntry(alice.id, "2025-03-01", "売上", [
      { accountId: a.bank.id, side: "debit", amount: 50000 },
      { accountId: a.sales.id, side: "credit", amount: 50000 },
    ]);
    const next = await closeYear(alice.id, 2025);
    expect(next).toMatchObject({ ok: true });
    if (!next.ok) return;
    const nextEntry = await prisma.journalEntry.findUnique({
      where: { id: next.openingEntryId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(nextEntry?.lines).toHaveLength(2);
    expect(nextEntry?.lines[0]).toMatchObject({
      accountId: a.bank.id,
      side: "debit",
      amount: 50000,
    });
    expect(nextEntry?.lines[1]).toMatchObject({
      accountId: a.capital.id,
      side: "credit",
      amount: 50000,
    });
  });

  test("全残高 0 で締めた後の休業年（仕訳ゼロ）も締められる", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    // 2023 年: 全残高が 0 になる年（明細 0 行の繰越で締める）。
    await createEntry(alice.id, "2023-04-01", "経費資金の受け入れ", [
      { accountId: a.bank.id, side: "debit", amount: 10000 },
      { accountId: a.ownerLoan.id, side: "credit", amount: 10000 },
    ]);
    await createEntry(alice.id, "2023-05-01", "通信費", [
      { accountId: a.telecom.id, side: "debit", amount: 10000 },
      { accountId: a.bank.id, side: "credit", amount: 10000 },
    ]);
    expect((await closeYear(alice.id, 2023)).ok).toBe(true);

    // 2024 年: 仕訳ゼロ（休業）。集計範囲の明細が空でも締められる。
    const dormant = await closeYear(alice.id, 2024);
    expect(dormant).toMatchObject({ ok: true });
    if (!dormant.ok) return;
    const dormantEntry = await prisma.journalEntry.findUnique({
      where: { id: dormant.openingEntryId },
      include: { lines: true },
    });
    expect(dormantEntry?.entryDate).toBe("2025-01-01");
    expect(dormantEntry?.lines).toHaveLength(0);

    // 2025 年: 再開。締めの連鎖が続き、残高も正しく積み上がる。
    await createEntry(alice.id, "2025-03-01", "売上", [
      { accountId: a.bank.id, side: "debit", amount: 50000 },
      { accountId: a.sales.id, side: "credit", amount: 50000 },
    ]);
    const resumed = await closeYear(alice.id, 2025);
    expect(resumed).toMatchObject({ ok: true });
    if (!resumed.ok) return;
    const resumedEntry = await prisma.journalEntry.findUnique({
      where: { id: resumed.openingEntryId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    expect(resumedEntry?.lines).toHaveLength(2);
    expect(resumedEntry?.lines[0]).toMatchObject({
      accountId: a.bank.id,
      side: "debit",
      amount: 50000,
    });
    expect(resumedEntry?.lines[1]).toMatchObject({
      accountId: a.capital.id,
      side: "credit",
      amount: 50000,
    });
  });

  test("他ユーザーのデータには影響しない（仕訳が無ければ締められない）", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);

    // bob には仕訳が無いので締められない。
    const result = await closeYear(bob.id, 2025);
    expect(result.ok).toBe(false);

    // alice の締めは bob の帳簿に影響しない。
    await closeYear(alice.id, 2025);
    expect(await getYearClosings(bob.id)).toHaveLength(0);
    expect(await getAggregationStart(bob.id)).toBeUndefined();
  });
});

// --- reopenYear -----------------------------------------------------------------

describe("reopenYear", () => {
  test("締めを解除すると YearClosing と繰越仕訳が消える", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);
    const closed = await closeYear(alice.id, 2025);
    if (!closed.ok) throw new Error("前提の締めに失敗");

    const result = await reopenYear(alice.id, 2025);
    expect(result).toEqual({ ok: true });

    expect(await getYearClosings(alice.id)).toHaveLength(0);
    expect(await getAggregationStart(alice.id)).toBeUndefined();
    // 繰越仕訳も明細ごと消える。
    expect(
      await prisma.journalEntry.findUnique({
        where: { id: closed.openingEntryId },
      }),
    ).toBeNull();
    expect(
      await prisma.journalLine.count({
        where: { entryId: closed.openingEntryId },
      }),
    ).toBe(0);
  });

  test("最新の締め年しか解除できない", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await createEntry(alice.id, "2024-05-01", "開業", [
      { accountId: a.bank.id, side: "debit", amount: 100000 },
      { accountId: a.capital.id, side: "credit", amount: 100000 },
    ]);
    await createEntry(alice.id, "2025-03-01", "売上", [
      { accountId: a.bank.id, side: "debit", amount: 50000 },
      { accountId: a.sales.id, side: "credit", amount: 50000 },
    ]);
    await closeYear(alice.id, 2024);
    await closeYear(alice.id, 2025);

    const result = await reopenYear(alice.id, 2024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("2025");

    // 2025 → 2024 の順なら解除できる。
    expect((await reopenYear(alice.id, 2025)).ok).toBe(true);
    expect((await reopenYear(alice.id, 2024)).ok).toBe(true);
  });

  test("締めていない年・他ユーザーの締めは解除できない", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);
    await closeYear(alice.id, 2025);

    expect((await reopenYear(alice.id, 2024)).ok).toBe(false);
    // bob からは alice の締めは見えない＝解除できない。
    expect((await reopenYear(bob.id, 2025)).ok).toBe(false);
    expect(await getYearClosings(alice.id)).toHaveLength(1);
  });
});

// --- 繰越仕訳の保護 ---------------------------------------------------------------

describe("繰越仕訳の保護", () => {
  test("繰越仕訳は通常の仕訳削除では消せない（締め解除でのみ消える）", async () => {
    const alice = await createUser("alice@example.com");
    const a = await createStandardAccounts(alice.id);
    await seed2025(alice.id, a);
    const closed = await closeYear(alice.id, 2025);
    if (!closed.ok) throw new Error("前提の締めに失敗");

    // YearClosing が Restrict で参照しているため削除は失敗し、仕訳は残る。
    const result = await deleteJournalEntry(alice.id, closed.openingEntryId);
    expect(result).toEqual({ ok: false });
    expect(
      await prisma.journalEntry.findUnique({
        where: { id: closed.openingEntryId },
      }),
    ).not.toBeNull();
  });
});
