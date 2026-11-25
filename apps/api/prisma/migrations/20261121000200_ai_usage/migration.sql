CREATE TYPE "AiExecutionStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED', 'BLOCKED');

CREATE TABLE "AiExecution" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "agentId" TEXT NOT NULL,
    "tool" TEXT,
    "status" "AiExecutionStatus" NOT NULL DEFAULT 'RESERVED',
    "quotaDay" DATE NOT NULL,
    "reservedCalls" INTEGER NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "accountedCalls" INTEGER NOT NULL,
    "accountedTokens" INTEGER NOT NULL,
    "attempts" INTEGER,
    "modelId" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "thinkingTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(18,10),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    CONSTRAINT "AiExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiExecution_quota_counters_check" CHECK (
        "reservedCalls" > 0 AND "reservedTokens" > 0 AND "accountedCalls" >= 0 AND "accountedTokens" >= 0
    ),
    CONSTRAINT "AiExecution_finished_status_check" CHECK (("status" = 'RESERVED') = ("finishedAt" IS NULL)),
    CONSTRAINT "AiExecution_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiExecution_organizationId_quotaDay_idx" ON "AiExecution"("organizationId", "quotaDay");
CREATE INDEX "AiExecution_organizationId_actorId_createdAt_idx" ON "AiExecution"("organizationId", "actorId", "createdAt");
