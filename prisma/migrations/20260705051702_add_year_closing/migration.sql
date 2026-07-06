-- CreateTable
CREATE TABLE "YearClosing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "openingEntryId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "YearClosing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "YearClosing_openingEntryId_fkey" FOREIGN KEY ("openingEntryId") REFERENCES "JournalEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "YearClosing_openingEntryId_key" ON "YearClosing"("openingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "YearClosing_userId_year_key" ON "YearClosing"("userId", "year");
