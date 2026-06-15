import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

async function main() {
  // 開発用ログインパスワード（平文）。bcrypt でハッシュ化して保存する。
  const password = "password";

  const data = {
    email: "kino2718@gmail.com",
    passwordHash: await hashPassword(password),
    displayName: "kino2718",
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
