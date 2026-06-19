import { prisma } from "@/lib/prisma";
import type { AccountType } from "../generated/prisma/enums";

// 初期投入する勘定科目。
// code は分類ごとに百の位を割り当てた連番（asset=100番台 / liability=200番台 /
// equity=300番台 / revenue=400番台 / expense=500番台）。各分類内は登場順に +1 する。
// 補助科目は用途区分のみとし、銀行名・取引先名など個人を特定する情報は持たない。
type AccountSeed = {
  code: string;
  name: string;
  accountType: AccountType;
  subAccounts?: string[];
};

const ACCOUNTS: AccountSeed[] = [
  { code: "100", name: "現金", accountType: "asset" },
  { code: "101", name: "普通預金", accountType: "asset" },
  { code: "102", name: "売掛金", accountType: "asset" },
  { code: "103", name: "預け金", accountType: "asset" },
  { code: "300", name: "事業主貸", accountType: "equity" },
  { code: "301", name: "事業主借", accountType: "equity" },
  { code: "302", name: "元入金", accountType: "equity" },
  { code: "400", name: "売上高", accountType: "revenue" },
  {
    code: "500",
    name: "通信費",
    accountType: "expense",
    subAccounts: [
      "インターネット家事共有",
      "インターネット仕事のみ",
      "郵便・宅急便",
    ],
  },
  {
    code: "501",
    name: "水道光熱費",
    accountType: "expense",
    subAccounts: ["水道", "ガス", "電気", "ガス・電気"],
  },
  { code: "502", name: "地代家賃", accountType: "expense" },
];

async function seedAccounts(userId: number) {
  for (const a of ACCOUNTS) {
    const account = await prisma.account.upsert({
      where: { userId_code: { userId, code: a.code } },
      update: { name: a.name, accountType: a.accountType },
      create: {
        userId,
        code: a.code,
        name: a.name,
        accountType: a.accountType,
      },
    });

    for (const subName of a.subAccounts ?? []) {
      await prisma.subAccount.upsert({
        where: { accountId_name: { accountId: account.id, name: subName } },
        update: {},
        create: { accountId: account.id, name: subName },
      });
    }
  }
}

async function main() {
  // パスワードは平文をソースに残さず、ハッシュ済みの値を環境変数から読む。
  // ハッシュは lib/password.ts と同じ bcryptjs(cost 12) で生成すること。例:
  //   node -e "require('bcryptjs').hash('生パスワード',12).then(console.log)"
  const passwordHash = process.env.SEED_PASSWORD_HASH;
  if (!passwordHash) {
    throw new Error(
      "環境変数 SEED_PASSWORD_HASH が未設定です。bcrypt ハッシュを設定してください。",
    );
  }

  // ログインID（メールアドレス）。
  const email = process.env.SEED_EMAIL;
  if (!email) {
    throw new Error("環境変数 SEED_EMAIL が未設定です。");
  }

  const data = {
    email,
    passwordHash,
    // 表示名は任意。未設定なら null。
    displayName: process.env.SEED_DISPLAY_NAME ?? null,
  };

  const kino2718 = await prisma.user.upsert({
    where: { email: data.email },
    update: data,
    create: data,
  });
  console.log({ kino2718 });

  await seedAccounts(kino2718.id);
  const accountCount = await prisma.account.count({
    where: { userId: kino2718.id },
  });
  const subAccountCount = await prisma.subAccount.count({
    where: { account: { userId: kino2718.id } },
  });
  console.log({ accountCount, subAccountCount });
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
