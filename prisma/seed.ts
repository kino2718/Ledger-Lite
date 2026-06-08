import { prisma } from "@/lib/prisma";

async function main() {
  const data = {
    email: "kino2718@gmail.com",
    passwordHash: "password", // 仮
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
