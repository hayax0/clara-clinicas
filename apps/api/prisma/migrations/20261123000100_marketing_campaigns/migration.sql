CREATE TABLE "MarketingCampaign" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "source" TEXT,
  "objective" VARCHAR(280) NOT NULL,
  "message" VARCHAR(1200) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MarketingCampaignRecipient" (
  "id" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "contactName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMPTZ,
  "sentById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingCampaignRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketingCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketingCampaignRecipient_status_check" CHECK ("status" IN ('PENDING','SENT'))
);
CREATE UNIQUE INDEX "MarketingCampaignRecipient_campaignId_contactId_key" ON "MarketingCampaignRecipient"("campaignId","contactId");
CREATE INDEX "MarketingCampaign_organizationId_createdAt_idx" ON "MarketingCampaign"("organizationId","createdAt");
CREATE INDEX "MarketingCampaignRecipient_campaignId_status_idx" ON "MarketingCampaignRecipient"("campaignId","status");
