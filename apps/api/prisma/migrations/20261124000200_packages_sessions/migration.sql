CREATE TYPE "PatientPackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE UNIQUE INDEX "Appointment_organizationId_id_key" ON "Appointment"("organizationId", "id");
CREATE UNIQUE INDEX "FinanceEntry_organizationId_id_key" ON "FinanceEntry"("organizationId", "id");

CREATE TABLE "ServicePackage" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "serviceId" UUID,
  "totalSessions" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "validityDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicePackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServicePackage_organizationId_serviceId_fkey" FOREIGN KEY ("organizationId", "serviceId") REFERENCES "Service"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ServicePackage_organizationId_id_key" ON "ServicePackage"("organizationId", "id");
CREATE INDEX "ServicePackage_organizationId_active_idx" ON "ServicePackage"("organizationId", "active");

CREATE TABLE "PatientPackage" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "packageId" UUID NOT NULL,
  "professionalId" UUID,
  "financeEntryId" UUID,
  "totalSessions" INTEGER NOT NULL,
  "usedSessions" INTEGER NOT NULL DEFAULT 0,
  "priceCents" INTEGER NOT NULL,
  "status" "PatientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
  "purchasedAt" DATE NOT NULL,
  "expiresAt" DATE,
  "notes" VARCHAR(300),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientPackage_organizationId_patientId_fkey" FOREIGN KEY ("organizationId", "patientId") REFERENCES "Patient"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientPackage_organizationId_packageId_fkey" FOREIGN KEY ("organizationId", "packageId") REFERENCES "ServicePackage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientPackage_organizationId_professionalId_fkey" FOREIGN KEY ("organizationId", "professionalId") REFERENCES "Professional"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientPackage_organizationId_financeEntryId_fkey" FOREIGN KEY ("organizationId", "financeEntryId") REFERENCES "FinanceEntry"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PatientPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PatientPackage_organizationId_id_key" ON "PatientPackage"("organizationId", "id");
CREATE INDEX "PatientPackage_organizationId_patientId_idx" ON "PatientPackage"("organizationId", "patientId");
CREATE INDEX "PatientPackage_organizationId_status_idx" ON "PatientPackage"("organizationId", "status");

CREATE TABLE "PackageSessionUsage" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "patientPackageId" UUID NOT NULL,
  "appointmentId" UUID,
  "usedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" VARCHAR(240),
  "recordedById" UUID NOT NULL,
  "revertedAt" TIMESTAMPTZ,
  "revertedById" UUID,
  CONSTRAINT "PackageSessionUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PackageSessionUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PackageSessionUsage_organizationId_patientPackageId_fkey" FOREIGN KEY ("organizationId", "patientPackageId") REFERENCES "PatientPackage"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PackageSessionUsage_organizationId_appointmentId_fkey" FOREIGN KEY ("organizationId", "appointmentId") REFERENCES "Appointment"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PackageSessionUsage_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PackageSessionUsage_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PackageSessionUsage_organizationId_patientPackageId_idx" ON "PackageSessionUsage"("organizationId", "patientPackageId");
CREATE INDEX "PackageSessionUsage_organizationId_appointmentId_idx" ON "PackageSessionUsage"("organizationId", "appointmentId");
