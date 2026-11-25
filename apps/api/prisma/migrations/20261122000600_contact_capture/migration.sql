ALTER TABLE "Contact" ADD COLUMN "captureRequestId" UUID;
CREATE UNIQUE INDEX "Contact_organizationId_captureRequestId_key" ON "Contact" ("organizationId", "captureRequestId");
