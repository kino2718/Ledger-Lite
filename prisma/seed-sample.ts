// 開発用のサンプル仕訳 seed（本番では使わない）。
//
// 本番用の seed（User・勘定科目）は prisma/seed.ts にある。こちらは
// ホーム画面のダッシュボードなどを開発するためのダミー取引で、
// 不要になったらこのファイルごと削除すればよい（package.json の
// "seed:sample" スクリプトも合わせて消す）。
//
// 実行手順（クリーンな状態から）:
//   npx prisma migrate reset --force   # DB初期化
//   npx prisma db seed                 # 本番 seed（User・勘定科目）
//   npm run seed:sample                # このサンプル仕訳を投入
//
// 個人を特定する情報（実在の銀行・取引先など）は含めない。
import { prisma } from "@/lib/prisma";

type SampleLine = {
  code: string; // 勘定科目コード（prisma/seed.ts の採番に対応）
  sub?: string; // 補助科目名（任意）
  side: "debit" | "credit";
  amount: number;
};

type SampleEntry = {
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: SampleLine[];
};

// 貸借が一致した正しい仕訳のみ。2026年6月の取引として作成。
const SAMPLE_ENTRIES: SampleEntry[] = [
  {
    entryDate: "2026-06-01",
    description: "開業時の元手",
    lines: [
      { code: "101", side: "debit", amount: 1_000_000 }, // 普通預金
      { code: "302", side: "credit", amount: 1_000_000 }, // 元入金
    ],
  },
  {
    entryDate: "2026-06-01",
    description: "6月分 事務所家賃",
    lines: [
      { code: "502", side: "debit", amount: 80_000 }, // 地代家賃
      { code: "101", side: "credit", amount: 80_000 }, // 普通預金
    ],
  },
  {
    entryDate: "2026-06-05",
    description: "売上計上（掛）",
    lines: [
      { code: "102", side: "debit", amount: 120_000 }, // 売掛金
      { code: "400", side: "credit", amount: 120_000 }, // 売上高
    ],
  },
  {
    entryDate: "2026-06-10",
    description: "インターネット利用料",
    lines: [
      { code: "500", sub: "インターネット仕事のみ", side: "debit", amount: 5_000 }, // 通信費
      { code: "101", side: "credit", amount: 5_000 }, // 普通預金
    ],
  },
  {
    entryDate: "2026-06-12",
    description: "電気料金",
    lines: [
      { code: "501", sub: "電気", side: "debit", amount: 8_000 }, // 水道光熱費
      { code: "101", side: "credit", amount: 8_000 }, // 普通預金
    ],
  },
  {
    entryDate: "2026-06-15",
    description: "売掛金の回収",
    lines: [
      { code: "101", side: "debit", amount: 120_000 }, // 普通預金
      { code: "102", side: "credit", amount: 120_000 }, // 売掛金
    ],
  },
  {
    entryDate: "2026-06-18",
    description: "現金売上",
    lines: [
      { code: "100", side: "debit", amount: 30_000 }, // 現金
      { code: "400", side: "credit", amount: 30_000 }, // 売上高
    ],
  },
];

async function main() {
  const email = process.env.SEED_EMAIL;
  if (!email) {
    throw new Error("環境変数 SEED_EMAIL が未設定です。");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(
      `ユーザー ${email} が見つかりません。先に \`npx prisma db seed\` を実行してください。`,
    );
  }

  // 勘定科目・補助科目を引くためのマップを用意する。
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    include: { subAccounts: true },
  });
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));

  const resolveLine = (line: SampleLine) => {
    const account = accountByCode.get(line.code);
    if (!account) {
      throw new Error(`勘定科目コード ${line.code} が見つかりません。`);
    }
    let subAccountId: number | null = null;
    if (line.sub) {
      const sub = account.subAccounts.find((s) => s.name === line.sub);
      if (!sub) {
        throw new Error(
          `補助科目 ${account.name}/${line.sub} が見つかりません。`,
        );
      }
      subAccountId = sub.id;
    }
    return {
      accountId: account.id,
      subAccountId,
      side: line.side,
      amount: line.amount,
    };
  };

  // 再実行で重複しないよう、対象ユーザーの既存仕訳を一旦消してから入れ直す。
  // （サンプル用の開発スクリプトなので破壊的に振る舞う。本番では実行しない。）
  await prisma.$transaction(async (tx) => {
    const deleted = await tx.journalEntry.deleteMany({
      where: { userId: user.id },
    });
    if (deleted.count > 0) {
      console.log(`既存の仕訳 ${deleted.count} 件を削除しました。`);
    }

    for (const entry of SAMPLE_ENTRIES) {
      await tx.journalEntry.create({
        data: {
          userId: user.id,
          entryDate: entry.entryDate,
          description: entry.description,
          lines: {
            create: entry.lines.map((line, i) => ({
              lineNo: i + 1,
              ...resolveLine(line),
            })),
          },
        },
      });
    }
  });

  const entryCount = await prisma.journalEntry.count({
    where: { userId: user.id },
  });
  const lineCount = await prisma.journalLine.count({
    where: { entry: { userId: user.id } },
  });
  console.log({ entryCount, lineCount });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
