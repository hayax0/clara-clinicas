import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { name, parse } from '../validation.js';
import { dateParts } from './chat-date.js';
import { z } from 'zod';

export type AssistantAction =
  | { kind: 'remember'; note: string }
  | { kind: 'recall' }
  | { kind: 'propose_task'; title: string }
  | { kind: 'confirm_task' }
  | { kind: 'cancel_task' };

type ChatScope = { organizationId: string; actorId: string; agentId: string };

const proposalDurationMs = 15 * 60 * 1000;
const noteInput = z.string().trim().min(2).max(280);

const completedTurn = {
  id: true, userText: true, answer: true, responderId: true, tool: true,
  metrics: true, createdAt: true, proposalExpiresAt: true,
} satisfies Prisma.AssistantTurnSelect;

export async function lockChatAccess(tx: Prisma.TransactionClient, { organizationId, actorId }: ChatScope) {
  // Serializes actions for the member and prevents concurrent changes to role or clinic status.
  const [permission] = await tx.$queryRaw<{ role: string; active: boolean }[]>`
    SELECT m.role::text AS role, o.status = 'ACTIVE' AS active
    FROM "Membership" m
    JOIN "Organization" o ON o.id = m."organizationId"
    WHERE m."organizationId" = ${organizationId}::uuid AND m."userId" = ${actorId}::uuid
    FOR NO KEY UPDATE OF m FOR SHARE OF o
  `;
  if (!permission?.active) throw new NotFoundException('Clínica indisponível.');
  if (!['OWNER', 'MANAGER', 'STAFF'].includes(permission.role)) {
    throw new ForbiddenException('Seu perfil não pode executar ações pelo assistente.');
  }
}

async function audit(tx: Prisma.TransactionClient, { organizationId, actorId }: ChatScope, action: string, resourceId: string) {
  await tx.auditEvent.create({ data: { organizationId, actorId, action, resourceId } });
}

export function finishAssistantAction(db: Database, scope: ChatScope, pendingTurnId: string, command: AssistantAction, locale = 'pt-BR') {
  return db.$transaction(async (tx) => {
    await lockChatAccess(tx, scope);
    const turn = await tx.assistantTurn.findFirst({
      where: { ...scope, id: pendingTurnId },
      select: completedTurn,
    });
    if (!turn) throw new NotFoundException('Mensagem indisponível.');
    if (turn.answer !== null) return turn;
    const isEn = locale === 'en-US';
    const isEs = locale === 'es-ES';
    const isPtPt = locale === 'pt-PT';

    const resolve = (answer: string, tool: string, proposal?: { title: string; expiresAt: Date; dueAt?: string }) =>
      tx.assistantTurn.update({
        where: { id: turn.id },
        data: {
          answer, tool, responderId: tool.startsWith('task_') && scope.agentId === 'main' ? 'operations' : scope.agentId, metrics: [],
          ...(proposal && { actionDraft: { dueAt: proposal.dueAt ?? null }, proposalTitle: proposal.title, proposalExpiresAt: proposal.expiresAt }),
        },
        select: completedTurn,
      });

    const { organizationId, actorId } = scope;
    if (command.kind === 'remember') {
      const note = parse(noteInput, command.note);
      const result = await tx.assistantNote.createManyAndReturn({
        data: { organizationId, actorId, note },
        skipDuplicates: true,
        select: { id: true },
      });
      if (result.length) await audit(tx, scope, 'assistant.note.saved', result[0].id);
      return resolve(
        result.length
          ? (isEn ? 'I’ll remember that in your next conversations at this clinic.' : isEs ? 'Lo recordaré en tus próximas conversaciones en esta clínica.' : isPtPt ? 'Vou guardar esta nota para as próximas conversas nesta clínica.' : 'Anotei para lembrar nas suas próximas conversas nesta clínica.')
          : (isEn ? 'I already have that note saved for your conversations at this clinic.' : isEs ? 'Ya tengo esa nota guardada para tus conversaciones en esta clínica.' : isPtPt ? 'Já tenho essa nota guardada para as suas conversas nesta clínica.' : 'Já tenho essa anotação guardada nas suas conversas desta clínica.'),
        'note_remember',
      );
    }
    if (command.kind === 'recall') {
      const notes = await tx.assistantNote.findMany({
        where: { organizationId, actorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { note: true },
      });
      const list = notes.map(({ note }) => `• ${note}`).join('\n');
      return resolve(notes.length
        ? `${isEn ? 'Here are your latest notes for this clinic.' : isEs ? 'Estas son tus notas más recientes en esta clínica.' : isPtPt ? 'Estas são as suas notas mais recentes nesta clínica.' : 'Estas são as suas anotações mais recentes nesta clínica.'}\n\n${list}`
        : (isEn ? 'I don’t have any notes from you at this clinic yet. Say “remember that…” and tell me a work preference you want to save.' : isEs ? 'Aún no tengo notas tuyas en esta clínica. Di «recuerda que…» y cuéntame qué preferencia de trabajo quieres guardar.' : isPtPt ? 'Ainda não tenho notas suas nesta clínica. Diga «lembra-te de…» e indique uma preferência de trabalho que queira guardar.' : 'Ainda não tenho nenhuma anotação sua nesta clínica. Quando quiser guardar uma preferência de trabalho, diga “lembre que…” e me conte qual é.'),
      'note_recall');
    }

    if (!['main', 'operations'].includes(scope.agentId)) {
      return resolve(isEn ? 'The Principal Agent and Operations assistant can create tasks with you.' : isEs ? 'El agente principal y el asistente de Operaciones pueden crear tareas contigo.' : isPtPt ? 'O Agente Principal e o assistente de Operações podem criar tarefas consigo.' : 'O Agente Principal e o ajudante de Operações podem criar tarefas com você.', 'task_unavailable');
    }

    const now = new Date();
    const proposal = await tx.assistantTurn.findFirst({
      where: { ...scope, answer: { not: null }, proposalTitle: { not: null }, proposalExpiresAt: { gt: now } },
      select: { id: true, proposalTitle: true, actionDraft: true, createdAt: true },
    });

    if (command.kind === 'propose_task') {
      const title = parse(name, command.title);
      if (proposal) {
        return resolve(
          isEn ? `The task “${proposal.proposalTitle}” is still awaiting your decision. Say “Confirm task” or “Cancel task” before proposing another.` : isEs ? `La tarea «${proposal.proposalTitle}» sigue pendiente. Di «Confirmar tarea» o «Cancelar tarea» antes de proponer otra.` : isPtPt ? `A tarefa «${proposal.proposalTitle}» ainda está pendente. Diga «Confirmar tarefa» ou «Cancelar tarefa» antes de propor outra.` : `Ainda está pendente a tarefa “${proposal.proposalTitle}”. Diga “Confirmar tarefa” ou “Cancelar a tarefa” para resolver essa antes de propor outra.`,
          'task_waiting',
        );
      }
      const market = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true, locale: true },
      });
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: market.timezone }).format(new Date());
      const parts = dateParts(title, today, market.locale);
      let dueAt: string | undefined;
      let deadline = '';
      if (parts.day || parts.relative !== undefined) {
        const hour = parts.time ?? '23:59';
        const [row] = await tx.$queryRaw<{epoch:number}[]>`SELECT extract(epoch FROM ((coalesce(${parts.day ?? null}::date,
          (now() AT TIME ZONE ${market.timezone})::date + ${parts.relative ?? 0}::int) + ${hour}::time) AT TIME ZONE ${market.timezone}))::float8 AS epoch`;
        const due = new Date(row.epoch * 1000);
        dueAt = due.toISOString();
        deadline = market.locale === 'en-US'
          ? ' due '+due.toLocaleString(market.locale, { timeZone: market.timezone })
          : market.locale === 'es-ES'
            ? ' con vencimiento el '+due.toLocaleString(market.locale, { timeZone: market.timezone })
            : market.locale === 'pt-PT'
              ? ' com prazo em '+due.toLocaleString(market.locale, { timeZone: market.timezone })
              : ' com prazo em '+due.toLocaleString(market.locale, { timeZone: market.timezone });
      }
      await audit(tx, scope, 'assistant.task.proposed', turn.id);
      return resolve(
        isEn ? `Can I create the task “${title}”${deadline}? Say “Confirm task” to save it or “Cancel task” to discard it.` : isEs ? `¿Creo la tarea «${title}»${deadline}? Di «Confirmar tarea» para guardarla o «Cancelar tarea» para descartarla.` : isPtPt ? `Posso criar a tarefa «${title}»${deadline}? Diga «Confirmar tarefa» para a guardar ou «Cancelar tarefa» para a descartar.` : `Posso criar a tarefa “${title}”${deadline}. Diga “Confirmar tarefa” para salvar ou “Cancelar a tarefa” para descartar.`,
        'task_proposal',
        { title, dueAt, expiresAt: new Date(now.getTime() + proposalDurationMs) },
      );
    }

    if (!proposal?.proposalTitle || proposal.createdAt > turn.createdAt) {
      return resolve(isEn ? 'I couldn’t find an open task proposal in this conversation. Tell me what task you’d like me to prepare.' : isEs ? 'No he encontrado una propuesta de tarea pendiente en esta conversación. Dime qué tarea quieres que prepare.' : isPtPt ? 'Não encontrei uma proposta de tarefa pendente nesta conversa. Diga-me que tarefa pretende preparar.' : 'Não encontrei uma proposta de tarefa em aberto nesta conversa. Se quiser, me diga qual tarefa devo preparar.', 'task_missing');
    }

    await tx.assistantTurn.update({
      where: { id: proposal.id },
      data: { proposalTitle: null, proposalExpiresAt: null },
    });
    if (command.kind === 'cancel_task') {
      await audit(tx, scope, 'assistant.task.cancelled', proposal.id);
      return resolve(isEn ? `I discarded the task proposal “${proposal.proposalTitle}”.` : isEs ? `He descartado la propuesta de tarea «${proposal.proposalTitle}».` : isPtPt ? `Descartei a proposta de tarefa «${proposal.proposalTitle}».` : `Descartei a proposta “${proposal.proposalTitle}”.`, 'task_cancelled');
    }
    if (command.kind !== 'confirm_task') throw new BadRequestException('Ação indisponível.');

    const stored = z.object({dueAt: z.string().nullable()}).safeParse(proposal.actionDraft);
    const dueAt = stored.success ? stored.data.dueAt : null;
    const task = await tx.task.create({
      data: { id: randomUUID(), organizationId, title: proposal.proposalTitle, dueAt, status: 'OPEN' },
      select: { id: true, title: true },
    });
    await audit(tx, scope, 'assistant.task.created', task.id);
    return resolve(isEn ? `I created “${task.title}”. It’s now in your clinic’s Tasks.` : isEs ? `He creado «${task.title}». Ya aparece en Tareas de tu clínica.` : isPtPt ? `Criei «${task.title}». Já aparece em Tarefas da sua clínica.` : `Criei “${task.title}”. Ela já aparece em Tarefas da sua clínica.`, 'task_created');
  });
}
