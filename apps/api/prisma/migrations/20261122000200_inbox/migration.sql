-- CreateTable
CREATE TABLE "InboxThread" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "contactId" UUID,
    "assigneeId" UUID,
    "subject" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxThread_organizationId_updatedAt_idx" ON "InboxThread"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_threadId_version_key" ON "InboxEvent"("threadId", "version");

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

