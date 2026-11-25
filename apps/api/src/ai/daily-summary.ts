import { todayAppointmentsFilter } from '../clinic-metrics.js';
import type { Database } from '../database.js';
import { Prisma } from '../generated/prisma/client.js';

const previewLimit = 3;

export function pendingTasks(organizationId: string): Prisma.TaskWhereInput {
  return { organizationId, status: 'OPEN' };
}

export function openOpportunities(organizationId: string): Prisma.OpportunityWhereInput {
  return { organizationId, stage: { in: ['NEW', 'CONTACTED', 'BOOKED'] } };
}

function describe(label: string, total: number, items: string[], locale: string) {
  if (!total) return `${label}. ${locale === 'en-US' ? 'None.' : locale === 'es-ES' ? 'Ningún registro.' : locale === 'pt-PT' ? 'Nenhum registo.' : 'Nenhum registro.'}`;
  const remaining = total - items.length;
  const list = items.join(', ');
  const more = locale === 'en-US' ? ` and ${remaining} more` : locale === 'es-ES' ? ` y ${remaining} más` : locale === 'pt-PT' ? ` e mais ${remaining}` : ` e mais ${remaining}`;
  return `${label}. ${list}${remaining > 0 ? more : ''}.`;
}

export async function readDailySummary(db: Database, organizationId: string, timezone: string, locale = 'pt-BR') {
  const tasks = pendingTasks(organizationId);
  const opportunities = openOpportunities(organizationId);
  const [[agenda], opportunityCount, opportunityPreview, taskCount, taskPreview] = await db.$transaction([
    db.$queryRaw<{ count: number; times: Date[] }[]>(Prisma.sql`
      WITH pending AS (
        SELECT "startAt" FROM "Appointment"
        WHERE ${todayAppointmentsFilter(organizationId, timezone)} AND "status" = 'SCHEDULED'
      )
      SELECT (SELECT count(*)::int FROM pending) AS count,
        ARRAY(SELECT "startAt"
          FROM pending ORDER BY "startAt" LIMIT ${previewLimit}) AS times
    `),
    db.opportunity.count({ where: opportunities }),
    db.opportunity.findMany({
      where: opportunities,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: previewLimit,
      select: { title: true },
    }),
    db.task.count({ where: tasks }),
    db.task.findMany({
      where: tasks,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: previewLimit,
      select: { title: true },
    }),
  ], { isolationLevel: 'RepeatableRead' });

  const isEn = locale === 'en-US';
  const isEs = locale === 'es-ES';
  const isPtPt = locale === 'pt-PT';
  const times = agenda.times.map((time) => time.toLocaleTimeString(locale, {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', ...(isEn ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }),
  }));
  const labels = isEn
    ? ['Today’s clinic summary', 'Appointments awaiting confirmation', 'Open opportunities', 'Pending tasks']
    : isEs
      ? ['Resumen diario de la clínica', 'Citas pendientes de confirmación', 'Oportunidades abiertas', 'Tareas pendientes']
      : isPtPt
        ? ['Resumo diário da clínica', 'Marcações por confirmar', 'Oportunidades em aberto', 'Tarefas pendentes']
        : ['Resumo do dia da sua clínica', 'Agenda a confirmar', 'Oportunidades em aberto', 'Tarefas pendentes'];

  return {
    answer: [
      labels[0],
      describe(labels[1], agenda.count, times, locale),
      describe(labels[2], opportunityCount, opportunityPreview.map(({ title }) => title), locale),
      describe(labels[3], taskCount, taskPreview.map(({ title }) => title), locale),
    ].join('\n\n'),
    metrics: [
      { label: isEn ? 'Appointments awaiting confirmation today' : isEs ? 'Citas pendientes hoy' : isPtPt ? 'Marcações por confirmar hoje' : 'Agendamentos a confirmar hoje', value: agenda.count },
      { label: labels[2], value: opportunityCount },
      { label: labels[3], value: taskCount },
    ],
  };
}
