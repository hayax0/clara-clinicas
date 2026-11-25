import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Database } from './database.js';

export const demoUserId = 'f43d8be4-161b-4670-9360-21d68ccc15d0';
export const demoOrganizationId = 'a7de9ddf-8c1a-4349-bbc1-9a7dcf4583ac';
export const demoEmail = 'demo@clara.invalid';
const localHosts = new Set(['localhost:4310', '127.0.0.1:4310', 'localhost:4311', '127.0.0.1:4311']);

export function demoAvailable(request: Request) {
  const host = request.get('x-forwarded-host') ?? request.get('host');
  return process.env.CLARA_LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production'
    && Boolean(host && localHosts.has(host))
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
}

export function provisionDemo(db: Database, passwordHash: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(637214381)`;
    await tx.user.upsert({
      where: { id: demoUserId },
      create: { id: demoUserId, email: demoEmail, name: 'Equipe demo', passwordHash },
      update: {},
    });
    const existing = await tx.organization.findUnique({ where: { id: demoOrganizationId } });
    if (existing) return;

    const organizationId = demoOrganizationId;
    const unitId = randomUUID();
    const professionalId = randomUUID();
    const serviceId = randomUUID();
    await tx.organization.create({
      data: {
        id: organizationId,
        name: 'Clínica demonstração',
        memberships: { create: { userId: demoUserId, role: 'STAFF' } },
      },
    });
    await tx.unit.create({ data: { id: unitId, organizationId, name: 'Unidade Centro' } });
    await tx.professional.create({ data: { id: professionalId, organizationId, name: 'Dra. Marina Demo' } });
    await tx.service.create({ data: { id: serviceId, organizationId, name: 'Consulta inicial', durationMinutes: 30, priceCents: 0 } });
    const [day] = await tx.$queryRaw<{ date: string }[]>`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date`;
    const appointments = [
      { name: 'Paciente Exemplo A', time: '09:00', end: '09:30', status: 'CONFIRMED' as const },
      { name: 'Paciente Exemplo B', time: '10:30', end: '11:00', status: 'SCHEDULED' as const },
      { name: 'Paciente Exemplo C', time: '14:00', end: '14:30', status: 'SCHEDULED' as const },
    ];
    for (const { name, time, end, status } of appointments) {
      const patientId = randomUUID();
      await tx.patient.create({ data: { id: patientId, organizationId, name } });
      await tx.appointment.create({
        data: {
          id: randomUUID(), organizationId, unitId, professionalId, serviceId, patientId, status,
          startAt: new Date(`${day.date}T${time}:00-03:00`),
          endAt: new Date(`${day.date}T${end}:00-03:00`),
        },
      });
    }
    const contactId = randomUUID();
    await tx.contact.create({ data: { id: contactId, organizationId, name: 'Contato Exemplo' } });
    await tx.opportunity.create({ data: { id: randomUUID(), organizationId, contactId, title: 'Avaliação inicial' } });
    await tx.task.createMany({
      data: ['Confirmar horários de amanhã', 'Retornar contato da avaliação'].map((title) => ({ id: randomUUID(), organizationId, title })),
    });
  });
}
