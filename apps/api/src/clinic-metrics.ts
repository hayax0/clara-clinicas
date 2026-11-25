import type { Database } from './database.js';
import { Prisma } from './generated/prisma/client.js';

export interface ClinicMetrics {
  appointments: number;
  patients: number;
  contacts: number;
  opportunities: number;
  tasks: number;
}

export function todayAppointmentsFilter(organizationId: string, timezone: string) {
  return Prisma.sql`"organizationId" = ${organizationId}::uuid AND "status" <> 'CANCELLED'
    AND "startAt" >= date_trunc('day', now(), ${timezone})
    AND "startAt" < (date_trunc('day', now() AT TIME ZONE ${timezone}) + interval '1 day') AT TIME ZONE ${timezone}`;
}

export async function readClinicMetrics(db: Database, orgId: string, timezone: string) {
  const [metrics] = await db.$queryRaw<ClinicMetrics[]>(Prisma.sql`
    SELECT
      (SELECT count(*)::int FROM "Appointment" WHERE ${todayAppointmentsFilter(orgId, timezone)}) AS appointments,
      (SELECT count(*)::int FROM "Patient" WHERE "organizationId" = ${orgId}::uuid) AS patients,
      (SELECT count(*)::int FROM "Contact" WHERE "organizationId" = ${orgId}::uuid) AS contacts,
      (SELECT count(*)::int FROM "Opportunity" WHERE "organizationId" = ${orgId}::uuid AND "stage" IN ('NEW', 'CONTACTED', 'BOOKED')) AS opportunities,
      (SELECT count(*)::int FROM "Task" WHERE "organizationId" = ${orgId}::uuid AND "status" = 'OPEN') AS tasks
  `);
  return metrics;
}
