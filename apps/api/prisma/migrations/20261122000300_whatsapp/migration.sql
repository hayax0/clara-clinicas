-- AlterTable
ALTER TABLE "InboxThread" ADD COLUMN     "waLastInbound" TIMESTAMPTZ,
ADD COLUMN     "waPeer" TEXT,
ADD COLUMN     "waPhone" TEXT;

-- AlterTable
ALTER TABLE "InboxEvent" ADD COLUMN     "delivery" TEXT,
ADD COLUMN     "externalId" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InboxThread_organizationId_waPhone_waPeer_key" ON "InboxThread"("organizationId", "waPhone", "waPeer");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_externalId_key" ON "InboxEvent"("externalId");

