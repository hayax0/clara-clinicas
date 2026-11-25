CREATE TABLE "AssistantTurn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "agentId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "userText" VARCHAR(320) NOT NULL,
    "answer" TEXT,
    "responderId" TEXT,
    "tool" TEXT,
    "metrics" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssistantTurn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssistantTurn_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssistantTurn_organizationId_actorId_agentId_requestId_key"
    ON "AssistantTurn"("organizationId", "actorId", "agentId", "requestId");
CREATE INDEX "AssistantTurn_organizationId_actorId_agentId_createdAt_idx"
    ON "AssistantTurn"("organizationId", "actorId", "agentId", "createdAt");
