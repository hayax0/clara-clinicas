ALTER TABLE "AssistantTurn"
ADD COLUMN "proposalTitle" VARCHAR(120),
ADD COLUMN "proposalExpiresAt" TIMESTAMPTZ;

CREATE TABLE "AssistantNote" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "note" VARCHAR(280) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantNote_organizationId_actorId_note_key" ON "AssistantNote"("organizationId", "actorId", "note");
CREATE INDEX "AssistantNote_organizationId_actorId_createdAt_idx" ON "AssistantNote"("organizationId", "actorId", "createdAt");

ALTER TABLE "AssistantNote" ADD CONSTRAINT "AssistantNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantNote" ADD CONSTRAINT "AssistantNote_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
