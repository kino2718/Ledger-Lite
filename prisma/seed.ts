import { prisma } from "@/lib/prisma";

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
