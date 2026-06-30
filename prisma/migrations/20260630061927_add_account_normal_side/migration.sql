/*
  Account に通常残高の向き normalSide を追加する。既存行は accountType から
  既定の向きを backfill する（資産・費用 = debit、負債・純資産・収益 = credit）。
  事業主貸のような評価勘定の上書きは seed 側で行う。
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "normalSide" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accountType", "code", "createdAt", "id", "isActive", "name", "normalSide", "updatedAt", "userId") SELECT "accountType", "code", "createdAt", "id", "isActive", "name", CASE WHEN "accountType" IN ('asset', 'expense') THEN 'debit' ELSE 'credit' END, "updatedAt", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_userId_code_key" ON "Account"("userId", "code");
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
