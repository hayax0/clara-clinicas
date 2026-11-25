-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderPhone" TEXT;

-- CreateTable
CREATE TABLE "AppointmentReminder" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "peer" TEXT NOT NULL,
    "phoneId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentReminder_externalId_key" ON "AppointmentReminder"("externalId");

-- CreateIndex
CREATE INDEX "AppointmentReminder_phoneId_peer_idx" ON "AppointmentReminder"("phoneId", "peer");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentReminder_appointmentId_patientId_startAt_peer_key" ON "AppointmentReminder"("appointmentId", "patientId", "startAt", "peer");

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

