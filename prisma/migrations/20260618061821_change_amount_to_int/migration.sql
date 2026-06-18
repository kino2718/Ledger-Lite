/*
  Warnings:

  - You are about to alter the column `amount` on the `JournalLine` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JournalLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "subAccountId" INTEGER,
    "side" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxCategory" TEXT,
    "lineMemo" TEXT,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JournalLine" ("accountId", "amount", "entryId", "id", "lineMemo", "lineNo", "side", "subAccountId", "taxCategory") SELECT "accountId", "amount", "entryId", "id", "lineMemo", "lineNo", "side", "subAccountId", "taxCategory" FROM "JournalLine";
DROP TABLE "JournalLine";
ALTER TABLE "new_JournalLine" RENAME TO "JournalLine";
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX "JournalLine_subAccountId_idx" ON "JournalLine"("subAccountId");
CREATE UNIQUE INDEX "JournalLine_entryId_lineNo_key" ON "JournalLine"("entryId", "lineNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
