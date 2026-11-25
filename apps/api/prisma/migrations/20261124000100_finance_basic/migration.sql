CREATE TYPE "FinanceType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinanceEntryStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'PIX', 'CARD', 'TRANSFER', 'OTHER');
CREATE TYPE "CashClosingStatus" AS ENUM ('CLOSED', 'REOPENED');

CREATE TABLE "FinanceCategory" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" "FinanceType" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinanceCategory_organizationId_id_key" ON "FinanceCategory"("organizationId", "id");
CREATE UNIQUE INDEX "FinanceCategory_organizationId_type_name_key" ON "FinanceCategory"("organizationId", "type", "name");
CREATE INDEX "FinanceCategory_organizationId_type_idx" ON "FinanceCategory"("organizationId", "type");

CREATE TABLE "FinanceEntry" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "FinanceType" NOT NULL,
  "status" "FinanceEntryStatus" NOT NULL DEFAULT 'PENDING',
  "description" VARCHAR(160) NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "dueDate" DATE NOT NULL,
  "settledDate" DATE,
  "settledAt" TIMESTAMPTZ,
  "settledById" UUID,
  "paymentMethod" "FinancePaymentMethod",
  "categoryId" UUID,
  "patientId" UUID,
  "professionalId" UUID,
  "notes" VARCHAR(300),
  "reconciledAt" TIMESTAMPTZ,
  "reconciledById" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "FinanceCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_organizationId_patientId_fkey" FOREIGN KEY ("organizationId", "patientId") REFERENCES "Patient"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_organizationId_professionalId_fkey" FOREIGN KEY ("organizationId", "professionalId") REFERENCES "Professional"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FinanceEntry_organizationId_dueDate_idx" ON "FinanceEntry"("organizationId", "dueDate");
CREATE INDEX "FinanceEntry_organizationId_settledDate_idx" ON "FinanceEntry"("organizationId", "settledDate");
CREATE INDEX "FinanceEntry_organizationId_status_idx" ON "FinanceEntry"("organizationId", "status");

CREATE TABLE "CashClosing" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "closingDate" DATE NOT NULL,
  "status" "CashClosingStatus" NOT NULL DEFAULT 'CLOSED',
  "receivedCents" INTEGER NOT NULL,
  "paidCents" INTEGER NOT NULL,
  "netCents" INTEGER NOT NULL,
  "reconciledCount" INTEGER NOT NULL,
  "notes" VARCHAR(300),
  "closedById" UUID NOT NULL,
  "closedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reopenedById" UUID,
  "reopenedAt" TIMESTAMPTZ,
  "reopenReason" VARCHAR(280),
  CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashClosing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CashClosing_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashClosing_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashClosing_organizationId_closingDate_key" ON "CashClosing"("organizationId", "closingDate");
CREATE INDEX "CashClosing_organizationId_closingDate_idx" ON "CashClosing"("organizationId", "closingDate");
