import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaBetterSqlite3({ url: connectionString });

// @prisma/adapter-better-sqlite3 は defaultSafeIntegers(true) で整数を bigint で返す。
// 型付きクエリでは列の宣言型がアダプタに見えず Int64 と推論されるため、schema 上
// Int（= TS 型は number）の id が実行時には bigint で返ってしまう。result 拡張で
// 取得時に number へ正規化し、型と実体を一致させる（JSON 化・Client への受け渡しも安全に）。
function createPrismaClient() {
  return new PrismaClient({ adapter }).$extends({
    result: {
      user: {
        id: {
          needs: { id: true },
          compute(user) {
            return Number(user.id);
          },
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { prisma };
