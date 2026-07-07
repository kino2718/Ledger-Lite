// 年度の締め・締め解除（書き込み）。検証を通った場合のみ DB へ反映する。
// 繰越額の計算は lib/closing/carryover.ts の純粋関数に任せ、
// ここは「検証 → 残高集計 → 繰越仕訳＋YearClosing の作成／削除」を束ねる。
import "server-only";
import { prisma } from "@/lib/prisma";
import { getAccounts, getFirstEntryDate } from "@/lib/journal/queries";
import { computeProfitLoss } from "@/lib/ledger/balance";
import { currentYear, yearOf } from "@/lib/ledger/period";
import {
  buildCarryoverLines,
  computeCarryoverBalances,
} from "./carryover";
import type { CarryoverLine } from "./carryover";
import { getAggregationStart, getCarryoverSourceLines } from "./queries";

export type CloseYearResult =
  | { ok: true; openingEntryId: number }
  | { ok: false; errors: string[] };

export type ReopenYearResult = { ok: true } | { ok: false; errors: string[] };

// 締めのプレビュー。実際に作られる繰越仕訳と同じ計算結果を返す。
export type CloseYearPreview = {
  // その年の損益（収益 − 費用）。
  netIncome: number;
  // 繰越仕訳になる明細（借方 → 貸方の順）。繰り越す残高が無ければ空。
  lines: CarryoverLine[];
};

export type PreviewCloseYearResult =
  | { ok: true; preview: CloseYearPreview }
  | { ok: false; errors: string[] };

// 繰越仕訳の摘要。仕訳一覧・元帳にこの名前で表示される。
export const OPENING_ENTRY_DESCRIPTION = "前期繰越";

// 締めで自動判定する純資産の科目名。
const CAPITAL_NAME = "元入金";
const OWNER_DRAW_NAME = "事業主貸";
const OWNER_LOAN_NAME = "事業主借";

/**
 * 年 year を締めたときに作られる繰越仕訳の内容を、実際には書き込まずに計算する。
 * 検証（終わった年か・順序・元入金の有無など）も締めと同じものを通すので、
 * ここが ok なら closeYear も同じ内容で成功する（間にデータが変わらない限り）。
 * - 終わった年だけ締められる（今年・未来は不可）
 * - 古い年から順にのみ締められる（帳簿の最初の年を除き、前年の締めが必要）
 * - 元入金・事業主貸・事業主借は純資産の科目から名前で探す（元入金は必須）
 */
export async function previewCloseYear(
  userId: number,
  year: number,
): Promise<PreviewCloseYearResult> {
  if (!Number.isInteger(year)) {
    return { ok: false, errors: ["締める年の指定が正しくありません。"] };
  }
  if (year >= currentYear()) {
    return {
      ok: false,
      errors: [`${year}年はまだ終わっていないため締められません。`],
    };
  }

  const existing = await prisma.yearClosing.findFirst({
    where: { userId, year },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, errors: [`${year}年はすでに締められています。`] };
  }

  // 帳簿の最初の年を求め、締める順序を検証する。
  const firstEntryDate = await getFirstEntryDate(userId);
  if (firstEntryDate === null) {
    return { ok: false, errors: ["仕訳がないため締められません。"] };
  }
  const firstYear = yearOf(firstEntryDate);
  if (year < firstYear) {
    return { ok: false, errors: [`${year}年には仕訳がありません。`] };
  }
  if (year > firstYear) {
    const previous = await prisma.yearClosing.findFirst({
      where: { userId, year: year - 1 },
      select: { id: true },
    });
    if (!previous) {
      return {
        ok: false,
        errors: [`古い年から順に締めてください（先に${year - 1}年）。`],
      };
    }
  }

  // 元入金・事業主貸・事業主借を純資産の科目から名前で探す。
  const equityAccounts = await prisma.account.findMany({
    where: {
      userId,
      accountType: "equity",
      name: { in: [CAPITAL_NAME, OWNER_DRAW_NAME, OWNER_LOAN_NAME] },
    },
    select: { id: true, name: true },
  });
  const byName = new Map(equityAccounts.map((a) => [a.name, a.id]));
  const capitalAccountId = byName.get(CAPITAL_NAME);
  if (capitalAccountId === undefined) {
    return {
      ok: false,
      errors: [
        `純資産に「${CAPITAL_NAME}」という名前の科目が見つかりません。科目を作成してから締めてください。`,
      ],
    };
  }

  // 集計開始日（前回の繰越仕訳の日付）から年末までを集計する。
  const from = await getAggregationStart(userId, year);
  const lines = await getCarryoverSourceLines(userId, {
    ...(from !== undefined ? { from } : {}),
    to: `${year}-12-31`,
  });
  // 明細が空でもエラーにしない。ここに来る時点で帳簿開始前の年は弾かれており、
  // 空になるのは「全残高 0 で締めた後の休業年」だけ（明細 0 行の繰越で締める）。

  // 繰越仕訳の明細を組み立てる（貸借一致の検算込み）。
  const netIncome = computeProfitLoss(lines).net;
  let carryoverLines;
  try {
    carryoverLines = buildCarryoverLines({
      balances: computeCarryoverBalances(lines),
      netIncome,
      capitalAccountId,
      ownerDrawAccountId: byName.get(OWNER_DRAW_NAME) ?? null,
      ownerLoanAccountId: byName.get(OWNER_LOAN_NAME) ?? null,
    });
  } catch (e) {
    return {
      ok: false,
      errors: [e instanceof Error ? e.message : "繰越額の計算に失敗しました。"],
    };
  }
  // 繰り越す残高が何も無ければ明細 0 行の繰越仕訳になる。
  // 集計起点の切り替えは YearClosing の記録だけで機能するため、これで問題ない。

  // 借方 → 貸方の順は保ったまま、それぞれの中を科目コード順に並べる
  // （試算表などの他画面と同じ並び。プレビューにも実際の仕訳にもこの順で入る）。
  const accounts = await getAccounts(userId);
  const codeById = new Map(accounts.map((a) => [a.id, a.code ?? ""]));
  const byCode = (x: CarryoverLine, y: CarryoverLine) =>
    (codeById.get(x.accountId) ?? "").localeCompare(
      codeById.get(y.accountId) ?? "",
    );
  const sortedLines = [
    ...carryoverLines.filter((line) => line.side === "debit").sort(byCode),
    ...carryoverLines.filter((line) => line.side === "credit").sort(byCode),
  ];

  return { ok: true, preview: { netIncome, lines: sortedLines } };
}

/**
 * 年 year を締める。翌年 1/1 付の繰越仕訳を生成し、YearClosing に記録する。
 * 検証と繰越額の計算は previewCloseYear と共通なので、
 * /closing に出すプレビューと実際に作られる仕訳は必ず一致する。
 */
export async function closeYear(
  userId: number,
  year: number,
): Promise<CloseYearResult> {
  const previewed = await previewCloseYear(userId, year);
  if (!previewed.ok) return previewed;

  // 繰越仕訳と YearClosing を 1 トランザクションで作成する。
  const openingEntryId = await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        userId,
        entryDate: `${year + 1}-01-01`,
        description: OPENING_ENTRY_DESCRIPTION,
        lines: {
          create: previewed.preview.lines.map((line, index) => ({
            lineNo: index + 1,
            accountId: line.accountId,
            subAccountId: line.subAccountId,
            side: line.side,
            amount: line.amount,
          })),
        },
      },
      select: { id: true },
    });
    await tx.yearClosing.create({
      data: { userId, year, openingEntryId: entry.id },
    });
    return entry.id;
  });

  return { ok: true, openingEntryId };
}

/**
 * 年 year の締めを解除する。YearClosing と繰越仕訳をまとめて削除する。
 * 繰越の連鎖が崩れないよう、最新の締め年しか解除できない。
 */
export async function reopenYear(
  userId: number,
  year: number,
): Promise<ReopenYearResult> {
  const closing = await prisma.yearClosing.findFirst({
    where: { userId, year },
    select: { id: true, openingEntryId: true },
  });
  if (!closing) {
    return { ok: false, errors: [`${year}年は締められていません。`] };
  }

  const newer = await prisma.yearClosing.findFirst({
    where: { userId, year: { gt: year } },
    orderBy: { year: "desc" },
    select: { year: true },
  });
  if (newer) {
    return {
      ok: false,
      errors: [`新しい年から順に解除してください（先に${newer.year}年）。`],
    };
  }

  // YearClosing が繰越仕訳を Restrict で参照しているため、締め → 仕訳の順で消す。
  await prisma.$transaction([
    prisma.yearClosing.delete({ where: { id: closing.id } }),
    prisma.journalEntry.delete({ where: { id: closing.openingEntryId } }),
  ]);

  return { ok: true };
}
