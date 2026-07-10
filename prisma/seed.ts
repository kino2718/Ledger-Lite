import { prisma } from "@/lib/prisma";
import { normalBalanceSide } from "@/lib/ledger/balance";
import type { AccountType, EntrySide } from "../generated/prisma/enums";

// 初期投入する勘定科目。
// code は分類ごとに百の位を割り当てた連番（asset=100番台 / liability=200番台 /
// equity=300番台 / revenue=400番台 / expense=500番台）。各分類内は登場順に +1 する。
// 補助科目は用途区分のみとし、銀行名・取引先名など個人を特定する情報は持たない。
// normalSide は通常残高の向き。未指定なら分類の既定（normalBalanceSide）を使い、
// 事業主貸のような評価勘定だけ明示的に上書きする。
type AccountSeed = {
  code: string;
  name: string;
  accountType: AccountType;
  normalSide?: EntrySide;
  subAccounts?: string[];
};

const ACCOUNTS: AccountSeed[] = [
  // 資産
  { code: "100", name: "現金", accountType: "asset" },
  { code: "101", name: "当座預金", accountType: "asset" },
  { code: "102", name: "定期預金", accountType: "asset" },
  { code: "103", name: "普通預金", accountType: "asset" },
  { code: "104", name: "受取手形", accountType: "asset" },
  { code: "105", name: "売掛金", accountType: "asset" },
  { code: "106", name: "有価証券", accountType: "asset" },
  { code: "107", name: "棚卸資産", accountType: "asset" },
  { code: "108", name: "前払金", accountType: "asset" },
  { code: "109", name: "貸付金", accountType: "asset" },
  { code: "110", name: "建物", accountType: "asset" },
  { code: "111", name: "建物附属設備", accountType: "asset" },
  { code: "112", name: "機械装置", accountType: "asset" },
  { code: "113", name: "車両運搬具", accountType: "asset" },
  { code: "114", name: "工具 器具 備品", accountType: "asset" },
  { code: "115", name: "土地", accountType: "asset" },
  // 貸倒引当金は資産の評価勘定（売掛金等のマイナス）のため通常残高は貸方。
  // 貸借対照表では貸方側（負債・純資産の部）に表示され、決算書の様式と揃う。
  { code: "116", name: "貸倒引当金", accountType: "asset", normalSide: "credit" },
  // 負債
  { code: "200", name: "支払手形", accountType: "liability" },
  { code: "201", name: "買掛金", accountType: "liability" },
  { code: "202", name: "借入金", accountType: "liability" },
  { code: "203", name: "未払金", accountType: "liability" },
  { code: "204", name: "前受金", accountType: "liability" },
  { code: "205", name: "預り金", accountType: "liability" },
  // 純資産
  // 事業主貸は純資産だが評価勘定のため通常残高は借方（引出しを借方に積む）。
  { code: "300", name: "事業主貸", accountType: "equity", normalSide: "debit" },
  { code: "301", name: "事業主借", accountType: "equity" },
  { code: "302", name: "元入金", accountType: "equity" },
  // 収益
  { code: "400", name: "売上高", accountType: "revenue" },
  // 費用
  { code: "500", name: "仕入", accountType: "expense" },
  { code: "501", name: "租税公課", accountType: "expense" },
  { code: "502", name: "荷造運賃", accountType: "expense" },
  {
    code: "503",
    name: "水道光熱費",
    accountType: "expense",
    subAccounts: ["水道", "ガス", "電気"],
  },
  { code: "504", name: "旅費交通費", accountType: "expense" },
  { code: "505", name: "通信費", accountType: "expense" },
  { code: "506", name: "広告宣伝費", accountType: "expense" },
  { code: "507", name: "接待交際費", accountType: "expense" },
  { code: "508", name: "損害保険料", accountType: "expense" },
  { code: "509", name: "修繕費", accountType: "expense" },
  { code: "510", name: "消耗品費", accountType: "expense" },
  { code: "511", name: "減価償却費", accountType: "expense" },
  { code: "512", name: "福利厚生費", accountType: "expense" },
  { code: "513", name: "給料賃金", accountType: "expense" },
  { code: "514", name: "外注工賃", accountType: "expense" },
  { code: "515", name: "利子割引料", accountType: "expense" },
  { code: "516", name: "地代家賃", accountType: "expense" },
  { code: "517", name: "貸倒金", accountType: "expense" },
];

async function seedAccounts(userId: number) {
  for (const a of ACCOUNTS) {
    // 未指定の科目は分類から既定の向きを決める。
    const normalSide = a.normalSide ?? normalBalanceSide(a.accountType);
    const account = await prisma.account.upsert({
      where: { userId_code: { userId, code: a.code } },
      update: { name: a.name, accountType: a.accountType, normalSide },
      create: {
        userId,
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        normalSide,
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
