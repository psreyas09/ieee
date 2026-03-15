-- CreateTable
CREATE TABLE "ScrapeRunLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "opportunitiesFound" INTEGER NOT NULL DEFAULT 0,
    "opportunitiesAdded" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,

    CONSTRAINT "ScrapeRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapeRunLog_organizationId_startedAt_idx" ON "ScrapeRunLog"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRunLog_status_startedAt_idx" ON "ScrapeRunLog"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "ScrapeRunLog" ADD CONSTRAINT "ScrapeRunLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
