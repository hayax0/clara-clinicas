import {
  BadGatewayException, Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject,
  Param, Post, Req, ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ModelRequest } from '@clinicas/ai-core';
import { z } from 'zod';
import { readClinicMetrics, todayAppointmentsFilter } from '../clinic-metrics.js';
import { Database } from '../database.js';
import { Prisma, type Role } from '../generated/prisma/client.js';
import { Access } from '../organizations.js';
import { parse } from '../validation.js';
import { consultationBody, consultations, planRequest, proposedTool, type ConsultationIntent } from './assistant-plan.js';
import { openOpportunities, pendingTasks, readDailySummary } from './daily-summary.js';
import { briefForTurn, semanticRequest, semanticTool } from './assistant-language.js';
import { chatAgentIds, permittedConsultations, routeChat, type ChatAgentId } from './assistant-routing.js';
import { finishAssistantAction } from './assistant-actions.js';
import { handleAppointmentAction } from './appointment-actions.js';
import { buildBrainRequest, parseBrainDecision, type BrainDecision, type BrainTool } from './assistant-brain.js';
import { followUpChat } from './follow-up-chat.js';
import { handleBooking } from './booking.js';
import { dateParts } from './chat-date.js';
import { interpretConversation } from './assistant-conversation.js';
import { geminiMaxAttempts, MODEL_PROVIDER, type GeminiProvider } from './gemini-provider.js';
import { AiUsage } from './usage.js';

const assistantRoles: Role[] = ['OWNER', 'MANAGER', 'STAFF'];
const agentParam = z.enum(chatAgentIds);
const chatBody = z.strictObject({
  message: z.string().trim().min(1, 'Escreva uma mensagem.').max(320, 'Use até 320 caracteres.'),
  requestId: z.uuid(),
});
const storedMetrics = z.array(z.object({ label: z.string(), value: z.number() }));
const turnSelection = {
  id: true, userText: true, answer: true, responderId: true, metrics: true, createdAt: true, tool: true, proposalExpiresAt: true,
} satisfies Prisma.AssistantTurnSelect;

const appointmentStatusLabel: Record<string, string> = {
  SCHEDULED: 'A confirmar',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const stageLabel: Record<string, string> = {
  NEW: 'Nova',
  CONTACTED: 'Em contato',
  BOOKED: 'Agendada',
  WON: 'Convertida',
  LOST: 'Perdida',
};

function chatMessage(turn: Prisma.AssistantTurnGetPayload<{ select: typeof turnSelection }>) {
  return { ...turn, metrics: storedMetrics.safeParse(turn.metrics).data ?? [] };
}

function briefDailySummary(metrics: { value: number }[]) {
  const [appointments, opportunities, tasks] = metrics.map(({ value }) => value);
  return `Hoje você tem ${appointments} ${appointments === 1 ? 'horário' : 'horários'} a confirmar, ${opportunities} ${opportunities === 1 ? 'oportunidade' : 'oportunidades'} em aberto e ${tasks} ${tasks === 1 ? 'tarefa pendente' : 'tarefas pendentes'}.`;
}

function summarizeChat(
  tool: ConsultationIntent,
  { answer, metrics }: { answer: string; metrics: { label: string; value: number }[] },
  brief = false,
) {
  if (!brief && answer) return answer;
  const total = metrics[0].value;
  switch (tool) {
    case 'daily_summary':
      return answer;
    case 'agenda_today':
      if (total === 0) return 'A agenda está livre hoje.';
      if (metrics[1].value === 0) return `Hoje há ${total} ${total === 1 ? 'agendamento' : 'agendamentos'}. Todos os horários estão confirmados ou já foram atendidos.`;
      return `Hoje há ${total} ${total === 1 ? 'agendamento' : 'agendamentos'}. Ainda ${metrics[1].value === 1 ? 'falta confirmar 1 horário' : `faltam confirmar ${metrics[1].value} horários`}.`;
    case 'open_tasks':
      return total === 0 ? 'Por aqui, as tarefas estão em dia.' : total === 1 ? 'A clínica tem 1 tarefa em aberto.' : `A clínica tem ${total} tarefas em aberto.`;
    case 'open_opportunities':
      return total === 0 ? 'Não há oportunidades abertas no CRM no momento.' : total === 1 ? 'Há 1 oportunidade em andamento no CRM.' : `Há ${total} oportunidades em andamento no CRM.`;
    case 'service_count':
      return total === 0 ? 'Nenhum serviço cadastrado ainda.' : total === 1 ? 'A clínica tem 1 serviço cadastrado.' : `A clínica tem ${total} serviços cadastrados.`;
    case 'clinic_metrics':
      return 'Separei a agenda de hoje, os cadastros e as pendências da sua clínica.';
  }
}

@Controller('organizations/:orgId/assistant')
export class AssistantController {
  constructor(
    private readonly db: Database,
    private readonly access: Access,
    private readonly usage: AiUsage,
    @Inject(MODEL_PROVIDER) private readonly model: GeminiProvider,
  ) {}

  @Get()
  async status(@Param('orgId') orgId: string, @Req() request: Request) {
    const { user, membership, organization } = await this.access.clinic(request, orgId);
    const authorized = assistantRoles.includes(membership.role);
    return {
      available: authorized && this.model.standardAvailable,
      reason: !authorized ? 'permission' : this.model.standardAvailable ? null : 'configuration',
      executions: authorized ? await this.usage.history(organization.id, user.id) : [],
    };
  }

  @Get('chats/:agentId')
  async chat(@Param('orgId') orgId: string, @Param('agentId') target: string, @Req() request: Request) {
    const { user, membership, organization } = await this.access.clinic(request, orgId);
    const agentId = parse(agentParam, target);
    if (!assistantRoles.includes(membership.role)) return { available: false, messages: [] };
    const messages = await this.db.assistantTurn.findMany({
      where: { organizationId: organization.id, actorId: user.id, agentId, answer: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      select: turnSelection,
    });
    return { available: true, modelAvailable: this.model.standardAvailable, messages: messages.reverse().map(chatMessage) };
  }

  @Post('chats/:agentId')
  @HttpCode(200)
  async send(@Param('orgId') orgId: string, @Param('agentId') target: string, @Body() body: unknown, @Req() request: Request) {
    const { user, organization } = await this.access.clinic(request, orgId, assistantRoles);
    const agentId = parse(agentParam, target);
    const { message, requestId } = parse(chatBody, body);
    const scope = { organizationId: organization.id, actorId: user.id, agentId };
    const key = { ...scope, requestId };
    const [pending] = await this.db.assistantTurn.createManyAndReturn({
      data: { ...key, userText: message }, skipDuplicates: true, select: { id: true },
    });
    if (!pending) {
      const previous = await this.db.assistantTurn.findUnique({
        where: { organizationId_actorId_agentId_requestId: key },
        select: turnSelection,
      });
      if (previous?.answer && previous.userText === message) return chatMessage(previous);
      throw new ConflictException('A mensagem ainda está sendo processada ou já foi usada em outra consulta.');
    }

    try {
      const followUp = await followUpChat(this.db, scope, pending.id, message, organization.timezone, organization.locale);
      if (followUp) return chatMessage(followUp);

      const conversation = interpretConversation(message, agentId, organization.locale);
      if (conversation && conversation.kind !== 'answer') {
        return chatMessage(await finishAssistantAction(this.db, scope, pending.id, conversation, organization.locale));
      }
      if (conversation?.kind === 'answer') {
        const turn = await this.db.assistantTurn.update({
          where: { id: pending.id },
          data: { answer: conversation.answer, responderId: agentId, metrics: [] },
          select: turnSelection,
        });
        return chatMessage(turn);
      }

      const appointmentAction = await handleAppointmentAction(this.db, scope, pending.id, message, organization.timezone, undefined, organization.locale);
      if (appointmentAction) return chatMessage(appointmentAction);

      const booking = await handleBooking(this.db, scope, pending.id, message, organization.timezone);
      if (booking) return chatMessage(booking);

      const previous = await this.db.assistantTurn.findFirst({
        where: { ...scope, tool: { not: null }, answer: { not: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { tool: true },
      });
      const lastTool = consultationBody.safeParse({ intent: previous?.tool }).data?.intent;
      const route = routeChat(message, agentId, lastTool);
      const allowed = permittedConsultations(agentId);
      const preferBrief = briefForTurn(message) ?? await this.prefersBriefReplies(scope.organizationId, scope.actorId);

      // Direct clinical safety or cross-area boundaries stay deterministic
      const isHardBoundary = Boolean(route.answer && (
        /profissional responsavel|outra area/i.test(route.answer.normalize('NFD').replace(/\p{Diacritic}/gu, ''))
      ));

      if (route.intent) {
        const result = await this.consult(orgId, { intent: route.intent }, request);
        if (result) {
          const answer = result.tool === 'daily_summary' && preferBrief
            ? briefDailySummary(result.metrics)
            : summarizeChat(result.tool, result, preferBrief);
          const turn = await this.db.assistantTurn.update({
            where: { id: pending.id },
            data: { answer, responderId: result.agentId, tool: result.tool, metrics: result.metrics },
            select: turnSelection,
          });
          return chatMessage(turn);
        }
      }

      // Use Gemini 3.8 Flash conversational brain for free-form, contextual, natural requests when configured
      if (!isHardBoundary && this.model.standardAvailable) {
        const decision = await this.runBrain(organization, user.id, agentId, message, preferBrief);
        if (decision) {
          const handled = await this.applyBrainDecision(decision, {
            orgId,
            organization,
            userId: user.id,
            agentId,
            scope,
            turnId: pending.id,
            message,
            preferBrief,
          });
          if (handled) return chatMessage(handled);
        }
      }

      // Fallback to semantic cue interpretation or honest local response
      const interpretation = !isHardBoundary && route.interpret && this.model.standardAvailable
        ? semanticRequest(message, allowed, lastTool)
        : undefined;
      const result = interpretation
        ? await this.runConsultation(organization.id, user.id, request, agentId, interpretation, (value) => semanticTool(value, allowed))
        : undefined;
      const reply = result
        ? {
            answer: result.tool === 'daily_summary' && preferBrief
              ? briefDailySummary(result.metrics)
              : summarizeChat(result.tool, result, preferBrief),
            responderId: result.agentId,
            tool: result.tool,
            metrics: result.metrics,
          }
        : { answer: route.answer ?? 'O que você quer conferir na clínica?', responderId: agentId, metrics: [] };
      const turn = await this.db.assistantTurn.update({ where: { id: pending.id }, data: reply, select: turnSelection });
      return chatMessage(turn);
    } catch (error) {
      await this.db.assistantTurn.deleteMany({ where: { id: pending.id, answer: null } });
      throw error;
    }
  }

  private async runBrain(
    organization: { id: string; name: string; locale?: string; currency?: string },
    actorId: string,
    agentId: ChatAgentId,
    message: string,
    preferBrief: boolean,
  ): Promise<BrainDecision | undefined> {
    const [recentTurns, notes] = await Promise.all([
      this.db.assistantTurn.findMany({
        where: { organizationId: organization.id, actorId, agentId, answer: { not: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: { userText: true, answer: true },
      }),
      this.db.assistantNote.findMany({
        where: { organizationId: organization.id, actorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { note: true },
      }),
    ]);

    const history = recentTurns.reverse().map((row) => ({ userText: row.userText, answer: row.answer ?? '' }));
    const requestPlan = buildBrainRequest({
      agentId,
      clinicName: organization.name,
      locale: organization.locale,
      currency: organization.currency,
      history,
      notes: notes.map((row) => row.note),
      message,
      preferBrief,
    });

    const reservation = await this.usage.reserve({
      organizationId: organization.id,
      actorId,
      agentId,
      estimatedTokens: 1_536 * geminiMaxAttempts,
      estimatedCalls: geminiMaxAttempts,
    });
    let completion: Parameters<AiUsage['finish']>[1] = { status: 'FAILED' };
    try {
      const modelResult = await this.model.generate(requestPlan);
      if (modelResult.status !== 'unavailable') completion.usage = modelResult.usage;
      if (modelResult.status !== 'completed' || modelResult.output.kind !== 'structured') {
        return undefined;
      }
      const decision = parseBrainDecision(modelResult.output.value);
      if (!decision) {
        completion.status = 'BLOCKED';
        return undefined;
      }
      completion = { ...completion, status: 'COMPLETED', tool: `brain:${decision.action}` };
      return decision;
    } finally {
      await this.usage.finish(reservation.id, completion);
    }
  }

  private async applyBrainDecision(
    decision: BrainDecision,
    ctx: {
      orgId: string;
      organization: { id: string; timezone: string; locale?: string; currency?: string };
      userId: string;
      agentId: ChatAgentId;
      scope: { organizationId: string; actorId: string; agentId: ChatAgentId };
      turnId: string;
      message: string;
      preferBrief: boolean;
    },
  ) {
    switch (decision.action) {
      case 'start_booking':
        if (['main', 'agenda'].includes(ctx.agentId)) {
          return handleBooking(this.db, ctx.scope, ctx.turnId, ctx.message, ctx.organization.timezone, {
            forceBooking: true,
            patientName: decision.patientName,
            dateText: decision.dateText,
            timeText: decision.timeText,
          });
        }
        break;
      case 'confirm_appointment':
      case 'cancel_appointment':
        if (['main', 'agenda'].includes(ctx.agentId)) {
          return handleAppointmentAction(this.db, ctx.scope, ctx.turnId, ctx.message, ctx.organization.timezone, {
            kind: decision.action === 'confirm_appointment' ? 'confirm' : 'cancel',
            patientHint: decision.patientName,
          }, ctx.organization.locale);
        }
        break;
      case 'register_patient':
        return handleBooking(this.db, ctx.scope, ctx.turnId, ctx.message, ctx.organization.timezone, {
          forceRegister: true,
          patientName: decision.patientName,
        });
      case 'register_clinic_item':
        if (['main', 'agenda', 'operations'].includes(ctx.agentId) && decision.itemKind) {
          return handleBooking(this.db, ctx.scope, ctx.turnId, ctx.message, ctx.organization.timezone, {
            setupKind: decision.itemKind,
            setupName: decision.itemName,
            durationMinutes: decision.durationMinutes,
            priceCents: decision.priceReais !== undefined ? Math.round(decision.priceReais * 100) : undefined,
            specialty: decision.specialty,
            address: decision.address,
          });
        }
        break;
      case 'propose_task':
        if (['main', 'operations'].includes(ctx.agentId) && decision.taskTitle) {
          return finishAssistantAction(this.db, ctx.scope, ctx.turnId, { kind: 'propose_task', title: decision.taskTitle }, ctx.organization.locale);
        }
        break;
      case 'consult':
        if (decision.tool) {
          const read = await this.readExtendedConsultation(
            decision.tool,
            ctx.organization.id,
            ctx.organization.timezone,
            ctx.preferBrief,
            {
              dateText: decision.dateText ?? ctx.message,
              patientName: decision.patientName,
              currency: ctx.organization.currency,
              locale: ctx.organization.locale,
            },
          );
          if (read) {
            return this.db.assistantTurn.update({
              where: { id: ctx.turnId },
              data: { answer: read.answer, responderId: read.agentId, tool: decision.tool, metrics: read.metrics },
              select: turnSelection,
            });
          }
        }
        break;
      case 'reply':
        if (decision.reply) {
          return this.db.assistantTurn.update({
            where: { id: ctx.turnId },
            data: { answer: decision.reply, responderId: ctx.agentId, tool: 'chat_reply', metrics: [] },
            select: turnSelection,
          });
        }
        break;
    }
    return undefined;
  }

  private async readExtendedConsultation(
    tool: BrainTool,
    organizationId: string,
    timezone: string,
    preferBrief: boolean,
    params?: { dateText?: string; patientName?: string; currency?: string; locale?: string },
  ) {
    const clinicLocale = params?.locale ?? 'pt-BR';
    const isEn = clinicLocale === 'en-US';
    const isEs = clinicLocale === 'es-ES';
    const isPtPt = clinicLocale === 'pt-PT';
    if (tool === 'agenda_schedule') {
      const dateLabel = (day: string) => new Intl.DateTimeFormat(clinicLocale, { timeZone: timezone, dateStyle: 'short' }).format(new Date(`${day}T12:00:00Z`));
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
      const rawHint = (params?.dateText ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const parsed = dateParts(params?.dateText ?? '', today, clinicLocale);
      let startDay = today;
      let endDay = today;
      let label = isEn ? 'today' : isEs ? 'hoy' : 'hoje';

      if (/\b(?:semana|week|proximos? dias|next 7 days|7 dias)\b/.test(rawHint)) {
        const end = new Date(`${today}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 6);
        endDay = end.toISOString().slice(0, 10);
        label = isEn ? `the next 7 days (${dateLabel(startDay)}–${dateLabel(endDay)})`
          : isEs ? `los próximos 7 días (${dateLabel(startDay)}–${dateLabel(endDay)})`
            : `os próximos 7 dias (${dateLabel(startDay)}–${dateLabel(endDay)})`;
      } else if (parsed.day) {
        startDay = parsed.day;
        endDay = parsed.day;
        label = isEn ? `on ${dateLabel(startDay)}` : isEs ? `el ${dateLabel(startDay)}` : `no dia ${dateLabel(startDay)}`;
      } else if (parsed.relative !== undefined || /\b(?:amanha|manana|tomorrow)\b/.test(rawHint)) {
        const offset = parsed.relative ?? 1;
        const target = new Date(`${today}T00:00:00.000Z`);
        target.setUTCDate(target.getUTCDate() + offset);
        startDay = target.toISOString().slice(0, 10);
        endDay = startDay;
        label = offset === 0 ? (isEn ? 'today' : isEs ? 'hoy' : 'hoje')
          : offset === 1 ? (isEn ? `tomorrow (${dateLabel(startDay)})` : isEs ? `mañana (${dateLabel(startDay)})` : `amanhã (${dateLabel(startDay)})`)
            : isEn ? `on ${dateLabel(startDay)}` : isEs ? `el ${dateLabel(startDay)}` : `no dia ${dateLabel(startDay)}`;
      }

      const rows = await this.db.$queryRaw<Array<{ startAt: Date; patient: string; professional: string; service: string; status: string }>>(Prisma.sql`
        SELECT
          a."startAt" AS "startAt",
          p."name" AS patient,
          pr."name" AS professional,
          s."name" AS service,
          a."status"::text AS status
        FROM "Appointment" a
        JOIN "Patient" p ON p."organizationId" = a."organizationId" AND p."id" = a."patientId"
        JOIN "Professional" pr ON pr."organizationId" = a."organizationId" AND pr."id" = a."professionalId"
        JOIN "Service" s ON s."organizationId" = a."organizationId" AND s."id" = a."serviceId"
        WHERE a."organizationId" = ${organizationId}::uuid
          AND a."status" <> 'CANCELLED'
          AND a."startAt" >= (${startDay}::date::timestamp AT TIME ZONE ${timezone})
          AND a."startAt" < ((${endDay}::date + 1)::timestamp AT TIME ZONE ${timezone})
        ORDER BY a."startAt" ASC
        LIMIT 12
      `);

      const pending = rows.filter((row) => row.status === 'SCHEDULED').length;
      if (!rows.length) {
        return {
          agentId: 'agenda' as const,
          answer: isEn ? `I couldn't find any active appointments ${label}.` : isEs ? `No he encontrado citas activas ${label}.` : isPtPt ? `Não encontrei marcações ativas ${label}.` : `Não encontrei agendamentos ativos ${label}.`,
          metrics: [{ label: isEn ? 'Appointments in period' : isEs ? 'Citas en el periodo' : isPtPt ? 'Marcações no período' : 'Agendamentos no período', value: 0 }],
        };
      }
      const multiDay = startDay !== endDay;
      const statusLabels = isEn
        ? { SCHEDULED: 'Awaiting confirmation', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }
        : isEs
          ? { SCHEDULED: 'Pendiente de confirmación', CONFIRMED: 'Confirmada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' }
          : isPtPt
            ? { SCHEDULED: 'Por confirmar', CONFIRMED: 'Confirmada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' }
            : { SCHEDULED: 'A confirmar', CONFIRMED: 'Confirmada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };
      const lines = rows.map((row) => {
        const day = new Intl.DateTimeFormat(clinicLocale, { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(row.startAt);
        const time = row.startAt.toLocaleTimeString(clinicLocale, {
          timeZone: timezone, hour: '2-digit', minute: '2-digit', ...(isEn ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }),
        });
        return `• ${multiDay ? `${day} ` : ''}${time} — ${row.patient} (${row.service} · ${row.professional} · ${statusLabels[row.status as keyof typeof statusLabels] ?? row.status})`;
      });
      const appointmentWord = isEn ? (rows.length === 1 ? 'appointment' : 'appointments')
        : isEs ? (rows.length === 1 ? 'cita' : 'citas')
          : isPtPt ? (rows.length === 1 ? 'marcação' : 'marcações')
            : (rows.length === 1 ? 'agendamento' : 'agendamentos');
      const pendingWord = isEn ? (pending === 1 ? 'awaiting confirmation' : 'awaiting confirmation')
        : isEs ? (pending === 1 ? 'pendiente de confirmación' : 'pendientes de confirmación')
          : isPtPt ? (pending === 1 ? 'por confirmar' : 'por confirmar')
            : (pending === 1 ? 'a confirmar' : 'a confirmar');
      const header = isEn ? `Schedule ${label}: ${rows.length} ${appointmentWord}${pending > 0 ? ` (${pending} ${pendingWord})` : ''}.`
        : isEs ? `Agenda ${label}: ${rows.length} ${appointmentWord}${pending > 0 ? ` (${pending} ${pendingWord})` : ''}.`
          : isPtPt ? `Agenda ${label}: ${rows.length} ${appointmentWord}${pending > 0 ? ` (${pending} ${pendingWord})` : ''}.`
            : `Agenda ${label}: ${rows.length} ${appointmentWord}${pending > 0 ? ` (${pending} ${pendingWord})` : ''}.`;
      const periodMetric = isEn ? 'Appointments in period' : isEs ? 'Citas en el periodo' : isPtPt ? 'Marcações no período' : 'Agendamentos no período';
      const pendingMetric = isEn ? 'Awaiting confirmation' : isEs ? 'Pendientes de confirmación' : isPtPt ? 'Por confirmar' : 'A confirmar';
      return {
        agentId: 'agenda' as const,
        answer: preferBrief ? header : `${header}\n\n${lines.join('\n')}`,
        metrics: [
          { label: periodMetric, value: rows.length },
          { label: pendingMetric, value: pending },
        ],
      };
    }

    if (tool === 'patient_overview') {
      const hint = params?.patientName?.trim();
      if (!hint) {
        return {
          agentId: 'agenda' as const,
          answer: isEn ? 'Which patient would you like to look up? Give me their full name or first name.' : isEs ? '¿Qué paciente quiere consultar? Dígame su nombre completo o de pila.' : isPtPt ? 'Que paciente pretende consultar? Diga-me o nome completo ou o primeiro nome.' : 'Qual paciente você quer consultar? Pode me dizer o nome completo ou o primeiro nome.',
          metrics: [],
        };
      }
      const norm = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
      const target = norm(hint);
      const allPatients = await this.db.patient.findMany({
        where: { organizationId },
        select: { id: true, name: true, phone: true, email: true },
        take: 300,
      });
      const matches = allPatients.filter((p) => {
        const candidate = norm(p.name);
        return candidate === target || candidate.startsWith(`${target} `) || candidate.includes(target);
      });
      if (!matches.length) {
        return {
          agentId: 'agenda' as const,
          answer: isEn ? `I couldn't find a patient named “${hint}” at this clinic. I can register them if you'd like.` : isEs ? `No he encontrado ningún paciente llamado “${hint}” en esta clínica. Si quiere, puedo registrarlo.` : isPtPt ? `Não encontrei nenhum paciente com o nome “${hint}” nesta clínica. Se quiser, posso registá-lo.` : `Não encontrei nenhum paciente chamado “${hint}” nesta clínica. Se quiser, posso cadastrar agora.`,
          metrics: [],
        };
      }
      if (matches.length > 1) {
        return {
          agentId: 'agenda' as const,
          answer: isEn ? `I found more than one patient with that name: ${matches.slice(0, 6).map((p) => p.name).join(', ')}. Which one do you mean?` : isEs ? `He encontrado varios pacientes con ese nombre: ${matches.slice(0, 6).map((p) => p.name).join(', ')}. ¿Cuál busca?` : isPtPt ? `Encontrei mais do que um paciente com esse nome: ${matches.slice(0, 6).map((p) => p.name).join(', ')}. Qual pretende consultar?` : `Encontrei mais de um paciente com esse nome: ${matches.slice(0, 6).map((p) => p.name).join(', ')}. Qual deles você quer ver?`,
          metrics: [],
        };
      }
      const patient = matches[0];
      const [appointments, packages] = await Promise.all([
        this.db.appointment.findMany({
          where: { organizationId, patientId: patient.id, status: { not: 'CANCELLED' } },
          orderBy: { startAt: 'desc' },
          take: 4,
          select: {
            startAt: true,
            status: true,
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
        }),
        this.db.patientPackage.findMany({
          where: { organizationId, patientId: patient.id, status: 'ACTIVE' },
          select: {
            totalSessions: true,
            usedSessions: true,
            expiresAt: true,
            servicePackage: { select: { name: true } },
          },
        }),
      ]);
      const statusLabels = isEn
        ? { SCHEDULED: 'Awaiting confirmation', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }
        : isEs
          ? { SCHEDULED: 'Pendiente de confirmación', CONFIRMED: 'Confirmada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' }
          : isPtPt
            ? { SCHEDULED: 'Por confirmar', CONFIRMED: 'Confirmada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' }
            : { SCHEDULED: 'A confirmar', CONFIRMED: 'Confirmada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' };
      const contact = [patient.phone, patient.email].filter(Boolean).join(' · ');
      const lines = [
        isEn ? `Administrative record for ${patient.name}:` : isEs ? `Ficha administrativa de ${patient.name}:` : isPtPt ? `Ficha administrativa de ${patient.name}:` : `Ficha administrativa de ${patient.name}:`,
        `• ${isEn ? 'Contact' : isEs ? 'Contacto' : isPtPt ? 'Contacto' : 'Contato'}: ${contact || (isEn ? 'no phone or email on file' : isEs ? 'sin teléfono ni correo electrónico' : isPtPt ? 'sem telefone ou e-mail registado' : 'sem telefone ou e-mail cadastrado')}`,
      ];
      if (appointments.length) {
        lines.push(`• ${isEn ? 'Recent/upcoming appointments' : isEs ? 'Citas recientes o próximas' : isPtPt ? 'Marcações recentes/próximas' : 'Agendamentos recentes/próximos'}:`);
        for (const appt of appointments) {
          const when = appt.startAt.toLocaleString(clinicLocale, { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
          lines.push(`  - ${when} · ${appt.service.name} (${appt.professional.name}) — ${statusLabels[appt.status as keyof typeof statusLabels] ?? appt.status}`);
        }
      } else {
        lines.push(`• ${isEn ? 'No appointments recorded yet.' : isEs ? 'Aún no hay citas registradas.' : isPtPt ? 'Ainda não há marcações registadas.' : 'Nenhum agendamento registrado até o momento.'}`);
      }
      if (packages.length) {
        lines.push(`• ${isEn ? 'Active packages' : isEs ? 'Bonos activos' : isPtPt ? 'Pacotes ativos' : 'Pacotes ativos'}:`);
        for (const pkg of packages) {
          const remaining = Math.max(0, pkg.totalSessions - pkg.usedSessions);
          lines.push(isEn
            ? `  - ${pkg.servicePackage.name}: ${pkg.usedSessions}/${pkg.totalSessions} sessions used (${remaining} remaining)`
            : isEs
              ? `  - ${pkg.servicePackage.name}: ${pkg.usedSessions}/${pkg.totalSessions} sesiones usadas (${remaining} restantes)`
              : isPtPt
                ? `  - ${pkg.servicePackage.name}: ${pkg.usedSessions}/${pkg.totalSessions} sessões usadas (${remaining} restantes)`
                : `  - ${pkg.servicePackage.name}: ${pkg.usedSessions}/${pkg.totalSessions} usadas (${remaining} restante(s))`);
        }
      }
      return {
        agentId: 'agenda' as const,
        answer: lines.join('\n'),
        metrics: [],
      };
    }

    if (tool === 'finance_month') {
      const clinicLocale = params?.locale ?? 'pt-BR';
      const clinicCurrency = params?.currency ?? 'BRL';
      const isEn = clinicLocale === 'en-US';
      const isEs = clinicLocale === 'es-ES';
      const isPtPt = clinicLocale === 'pt-PT';
      const moneyFmt = new Intl.NumberFormat(clinicLocale, { style: 'currency', currency: clinicCurrency });
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
      const monthStart = `${today.slice(0, 8)}01`;
      const paymentNames: Record<string, string> = isEn
        ? { PIX: 'Pix', CARD: 'Card', CASH: 'Cash', TRANSFER: 'Bank transfer', OTHER: 'Other' }
        : isEs
          ? { PIX: 'Transferencia instantánea (Pix)', CARD: 'Tarjeta', CASH: 'Efectivo', TRANSFER: 'Transferencia bancaria', OTHER: 'Otro' }
          : isPtPt
            ? { PIX: 'Pix', CARD: 'Cartão', CASH: 'Numerário', TRANSFER: 'Transferência bancária', OTHER: 'Outro' }
            : { PIX: 'Pix', CARD: 'Cartão', CASH: 'Dinheiro', TRANSFER: 'Transferência', OTHER: 'Outro' };
      const [[row], paymentRows, [overdueRow]] = await Promise.all([
        this.db.$queryRaw<Array<{
          receivedCents: number;
          paidCents: number;
          receivableOpenCents: number;
          payableOpenCents: number;
          unreconciledCount: number;
        }>>`
          SELECT
            coalesce(sum("amountCents") FILTER (WHERE "status" = 'PAID' AND "type" = 'INCOME' AND "settledDate" BETWEEN ${monthStart}::date AND ${today}::date), 0)::int AS "receivedCents",
            coalesce(sum("amountCents") FILTER (WHERE "status" = 'PAID' AND "type" = 'EXPENSE' AND "settledDate" BETWEEN ${monthStart}::date AND ${today}::date), 0)::int AS "paidCents",
            coalesce(sum("amountCents") FILTER (WHERE "status" = 'PENDING' AND "type" = 'INCOME' AND "dueDate" BETWEEN ${monthStart}::date AND ${today}::date), 0)::int AS "receivableOpenCents",
            coalesce(sum("amountCents") FILTER (WHERE "status" = 'PENDING' AND "type" = 'EXPENSE' AND "dueDate" BETWEEN ${monthStart}::date AND ${today}::date), 0)::int AS "payableOpenCents",
            count(*) FILTER (WHERE "status" = 'PAID' AND "reconciledAt" IS NULL AND "settledDate" BETWEEN ${monthStart}::date AND ${today}::date)::int AS "unreconciledCount"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${organizationId}::uuid
        `,
        this.db.$queryRaw<Array<{
          paymentMethod: string | null;
          amountCents: number;
          count: number;
        }>>`
          SELECT
            "paymentMethod",
            coalesce(sum("amountCents"), 0)::int AS "amountCents",
            count(*)::int AS "count"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "status" = 'PAID'
            AND "type" = 'INCOME'
            AND "settledDate" BETWEEN ${monthStart}::date AND ${today}::date
          GROUP BY "paymentMethod"
          ORDER BY "amountCents" DESC, "count" DESC
        `,
        this.db.$queryRaw<Array<{
          receivableCents: number;
          receivableCount: number;
          payableCents: number;
          payableCount: number;
        }>>`
          SELECT
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'INCOME'), 0)::int AS "receivableCents",
            count(*) FILTER (WHERE "type" = 'INCOME')::int AS "receivableCount",
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'EXPENSE'), 0)::int AS "payableCents",
            count(*) FILTER (WHERE "type" = 'EXPENSE')::int AS "payableCount"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${organizationId}::uuid
            AND "status" = 'PENDING'
            AND "dueDate" < ${today}::date
        `,
      ]);
      const received = row?.receivedCents ?? 0;
      const paid = row?.paidCents ?? 0;
      const net = received - paid;
      const openRec = row?.receivableOpenCents ?? 0;
      const openPay = row?.payableOpenCents ?? 0;
      const unreconciled = row?.unreconciledCount ?? 0;
      const overdueRecCents = overdueRow?.receivableCents ?? 0;
      const overdueRecCount = overdueRow?.receivableCount ?? 0;
      const overduePayCents = overdueRow?.payableCents ?? 0;
      const overduePayCount = overdueRow?.payableCount ?? 0;

      const paymentSummary = paymentRows
        .map((item) => {
          const label = paymentNames[item.paymentMethod ?? 'OTHER'] ?? (isEn ? 'Other' : isEs ? 'Otro' : 'Outro');
          return `${label}: ${moneyFmt.format(item.amountCents / 100)} (${item.count})`;
        })
        .join(', ');
      const topPayment = paymentRows[0]
        ? `${paymentNames[paymentRows[0].paymentMethod ?? 'OTHER'] ?? (isEn ? 'Other' : isEs ? 'Otro' : 'Outro')} (${moneyFmt.format(paymentRows[0].amountCents / 100)})`
        : (isEn ? 'no settled receipts yet' : isEs ? 'ningún ingreso liquidado todavía' : isPtPt ? 'ainda não há recebimentos liquidados' : 'nenhum recebimento liquidado ainda');
      const overdueLine = overdueRecCount === 0 && overduePayCount === 0
        ? (isEn ? 'No overdue bills.' : isEs ? 'No hay cuentas vencidas.' : isPtPt ? 'Não há contas vencidas.' : 'Nenhuma conta vencida em aberto.')
        : isEn
          ? `Overdue: ${overdueRecCount} receivable (${moneyFmt.format(overdueRecCents / 100)}) and ${overduePayCount} payable (${moneyFmt.format(overduePayCents / 100)}).`
          : isEs
            ? `Vencidas: ${overdueRecCount} por cobrar (${moneyFmt.format(overdueRecCents / 100)}) y ${overduePayCount} por pagar (${moneyFmt.format(overduePayCents / 100)}).`
            : `Contas vencidas: ${overdueRecCount} a receber (${moneyFmt.format(overdueRecCents / 100)}) e ${overduePayCount} a pagar (${moneyFmt.format(overduePayCents / 100)}).`;
      const dateOptions: Intl.DateTimeFormatOptions = { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' };
      const periodStart = new Intl.DateTimeFormat(clinicLocale, dateOptions).format(new Date(`${monthStart}T12:00:00Z`));
      const periodEnd = new Intl.DateTimeFormat(clinicLocale, dateOptions).format(new Date(`${today}T12:00:00Z`));
      const answer = isEn
        ? preferBrief
          ? `Month to date: received ${moneyFmt.format(received / 100)}, paid ${moneyFmt.format(paid / 100)}, net ${moneyFmt.format(net / 100)}. Top method: ${topPayment}. ${overdueLine}`
          : [`Monthly financial summary (${periodStart} to ${periodEnd}):`, `• Received: ${moneyFmt.format(received / 100)}`, `• Paid: ${moneyFmt.format(paid / 100)}`, `• Net cash flow: ${moneyFmt.format(net / 100)}`, ...(paymentRows.length ? [`• Receipts by payment method: ${paymentSummary} (top: ${topPayment}).`] : ['• No settled receipts recorded this month yet.']), `• Open this period: ${moneyFmt.format(openRec / 100)} receivable and ${moneyFmt.format(openPay / 100)} payable`, `• ${overdueLine}`, ...(unreconciled > 0 ? [`• ${unreconciled} settled entries pending reconciliation.`] : []), 'For detailed breakdowns or CSV export, open Finance → Reports.'].join('\n')
        : isEs
          ? preferBrief
            ? `Este mes: ingresos ${moneyFmt.format(received / 100)}, gastos ${moneyFmt.format(paid / 100)}, saldo ${moneyFmt.format(net / 100)}. Principal método: ${topPayment}. ${overdueLine}`
            : [`Resumen financiero del mes (${periodStart}–${periodEnd}):`, `• Ingresos cobrados: ${moneyFmt.format(received / 100)}`, `• Gastos pagados: ${moneyFmt.format(paid / 100)}`, `• Saldo neto: ${moneyFmt.format(net / 100)}`, ...(paymentRows.length ? [`• Ingresos por método de pago: ${paymentSummary} (principal: ${topPayment}).`] : ['• Aún no hay ingresos liquidados este mes.']), `• Pendiente del periodo: ${moneyFmt.format(openRec / 100)} por cobrar y ${moneyFmt.format(openPay / 100)} por pagar`, `• ${overdueLine}`, ...(unreconciled > 0 ? [`• ${unreconciled} movimientos liquidados pendientes de conciliación.`] : []), 'Para ver informes detallados o exportar un CSV, abre Finanzas → Informes.'].join('\n')
          : isPtPt
            ? preferBrief
              ? `Este mês: recebido ${moneyFmt.format(received / 100)}, pago ${moneyFmt.format(paid / 100)}, saldo ${moneyFmt.format(net / 100)}. Principal método: ${topPayment}. ${overdueLine}`
              : [`Resumo financeiro do mês (${periodStart}–${periodEnd}):`, `• Recebido: ${moneyFmt.format(received / 100)}`, `• Pago: ${moneyFmt.format(paid / 100)}`, `• Saldo realizado: ${moneyFmt.format(net / 100)}`, ...(paymentRows.length ? [`• Recebimentos por método de pagamento: ${paymentSummary} (principal: ${topPayment}).`] : ['• Ainda não há recebimentos liquidados este mês.']), `• Por liquidar no período: ${moneyFmt.format(openRec / 100)} a receber e ${moneyFmt.format(openPay / 100)} a pagar`, `• ${overdueLine}`, ...(unreconciled > 0 ? [`• ${unreconciled} movimentos liquidados aguardam conferência.`] : []), 'Para consultar relatórios detalhados ou exportar CSV, abra Financeiro → Relatórios.'].join('\n')
            : preferBrief
              ? `No mês até hoje: recebido ${moneyFmt.format(received / 100)}, pago ${moneyFmt.format(paid / 100)}, saldo ${moneyFmt.format(net / 100)}. Maior forma de recebimento: ${topPayment}. ${overdueLine}`
              : [`Resumo financeiro do mês até hoje (${periodStart} a ${periodEnd}):`, `• Recebido: ${moneyFmt.format(received / 100)}`, `• Pago: ${moneyFmt.format(paid / 100)}`, `• Saldo realizado: ${moneyFmt.format(net / 100)}`, ...(paymentRows.length ? [`• Recebimentos por forma de pagamento: ${paymentSummary} (mais usada: ${topPayment}).`] : ['• Ainda não há recebimentos liquidados por forma de pagamento neste mês.']), `• Em aberto no período: ${moneyFmt.format(openRec / 100)} a receber e ${moneyFmt.format(openPay / 100)} a pagar`, `• ${overdueLine}`, ...(unreconciled > 0 ? [`• ${unreconciled} lançamento(s) liquidado(s) ainda aguardam conferência.`] : []), 'Para relatórios detalhados ou exportar CSV, abra Financeiro → Relatórios.'].join('\n');
      return {
        agentId: 'main' as const,
        answer,
        metrics: [],
      };
    }

    const result = await this.readConsultation(tool, organizationId, timezone, params?.locale, params?.currency);
    const answer = tool === 'daily_summary' && preferBrief
      ? briefDailySummary(result.metrics)
      : summarizeChat(tool, result, preferBrief);
    return { agentId: consultations[tool].agentId, answer, metrics: result.metrics };
  }

  private async prefersBriefReplies(organizationId: string, actorId: string) {
    const notes = await this.db.assistantNote.findMany({
      where: { organizationId, actorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { note: true },
    });
    for (const { note } of notes) {
      const preference = /^(?:eu )?prefiro respostas (?:mais )?(curtas|breves|resumidas|longas|detalhadas|com detalhes)[.!?]*$/i.exec(note);
      if (preference) return /curtas|breves|resumidas/i.test(preference[1]);
    }
    return false;
  }

  @Post()
  @HttpCode(200)
  async consult(@Param('orgId') orgId: string, @Body() body: unknown, @Req() request: Request) {
    const { user, organization } = await this.access.clinic(request, orgId, assistantRoles);
    const { intent } = parse(consultationBody, body);
    return this.runConsultation(organization.id, user.id, request, consultations[intent].agentId, planRequest(intent), (value) => proposedTool(value, intent));
  }

  private async runConsultation(
    orgId: string, actorId: string, request: Request, agentId: string,
    plan: ModelRequest, resolveTool: (value: unknown) => ConsultationIntent | null | undefined,
  ) {
    if (!this.model.standardAvailable) throw new ServiceUnavailableException('A integração com o Gemini precisa de configuração.');
    const reservation = await this.usage.reserve({
      organizationId: orgId, actorId, agentId,
      estimatedTokens: 1_024 * geminiMaxAttempts,
      estimatedCalls: geminiMaxAttempts,
    });
    let completion: Parameters<AiUsage['finish']>[1] = { status: 'FAILED' };
    try {
      // Scope and database results stay in this backend.
      const modelResult = await this.model.generate(plan);
      if (modelResult.status !== 'unavailable') completion.usage = modelResult.usage;
      if (modelResult.status === 'unavailable') throw new ServiceUnavailableException('O Gemini está indisponível para esta consulta.');
      if (modelResult.status === 'failed') {
        if (modelResult.reason === 'rate_limit') throw new HttpException('Limite temporário do Gemini. Tente novamente mais tarde.', 429);
        throw new BadGatewayException('O Gemini não concluiu a consulta. Tente novamente.');
      }

      const tool = modelResult.output.kind === 'structured' ? resolveTool(modelResult.output.value) : undefined;
      if (tool === null) {
        completion.status = 'COMPLETED';
        return;
      }
      if (!tool) {
        completion.status = 'BLOCKED';
        throw new BadGatewayException('A resposta do Gemini não corresponde à consulta autorizada.');
      }

      const current = await this.access.clinic(request, orgId, assistantRoles);
      const result = await this.readConsultation(tool, current.organization.id, current.organization.timezone, current.organization.locale, current.organization.currency);
      completion = { ...completion, status: 'COMPLETED', tool };
      return { agentId: consultations[tool].agentId, tool, ...result };
    } finally {
      await this.usage.finish(reservation.id, completion);
    }
  }

  private async readConsultation(tool: ConsultationIntent, id: string, timezone: string, locale = 'pt-BR', currency = 'BRL') {
    const scope = { organizationId: id };
    const isEn = locale === 'en-US';
    const isEs = locale === 'es-ES';
    const isPtPt = locale === 'pt-PT';
    switch (tool) {
      case 'daily_summary':
        return readDailySummary(this.db, id, timezone, locale);
      case 'agenda_today': {
        const [counts] = await this.db.$queryRaw<Array<{ total: number; pending: number }>>(Prisma.sql`
          SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" = 'SCHEDULED')::int AS pending
          FROM "Appointment" WHERE ${todayAppointmentsFilter(id, timezone)}
        `);
        const rows = await this.db.$queryRaw<Array<{ startAt: Date; patient: string; professional: string; status: string }>>(Prisma.sql`
          SELECT
            a."startAt" AS "startAt",
            p."name" AS patient,
            pr."name" AS professional,
            a."status"::text AS status
          FROM "Appointment" a
          JOIN "Patient" p ON p."organizationId" = a."organizationId" AND p."id" = a."patientId"
          JOIN "Professional" pr ON pr."organizationId" = a."organizationId" AND pr."id" = a."professionalId"
          WHERE a."organizationId" = ${id}::uuid
            AND a."status" <> 'CANCELLED'
            AND a."startAt" >= (date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone})
            AND a."startAt" < ((date_trunc('day', now() AT TIME ZONE ${timezone}) + interval '1 day') AT TIME ZONE ${timezone})
          ORDER BY a."startAt" ASC
          LIMIT 8
        `);
        const statusLabels = isEn
          ? { SCHEDULED: 'Awaiting confirmation', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }
          : isEs
            ? { SCHEDULED: 'Pendiente de confirmación', CONFIRMED: 'Confirmada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' }
            : isPtPt
              ? { SCHEDULED: 'Por confirmar', CONFIRMED: 'Confirmada', COMPLETED: 'Concluída', CANCELLED: 'Cancelada' }
              : appointmentStatusLabel;
        let answer: string;
        if (counts.total === 0) {
          answer = isEn ? 'The schedule is clear today.' : isEs ? 'La agenda está libre hoy.' : isPtPt ? 'A agenda está livre hoje.' : 'A agenda está livre hoje.';
        } else {
          const appointmentWord = isEn ? (counts.total === 1 ? 'appointment' : 'appointments') : isEs ? (counts.total === 1 ? 'cita' : 'citas') : isPtPt ? (counts.total === 1 ? 'marcação' : 'marcações') : (counts.total === 1 ? 'agendamento' : 'agendamentos');
          const header = isEn
            ? (counts.pending === 0 ? `Today there are ${counts.total} ${appointmentWord}; all are confirmed or completed:` : `Today there are ${counts.total} ${appointmentWord} (${counts.pending} awaiting confirmation):`)
            : isEs
              ? (counts.pending === 0 ? `Hoy hay ${counts.total} ${appointmentWord} y todas están confirmadas o completadas:` : `Hoy hay ${counts.total} ${appointmentWord} pendientes de confirmación:`)
              : isPtPt
                ? (counts.pending === 0 ? `Hoje há ${counts.total} ${appointmentWord} e estão todas confirmadas ou concluídas:` : `Hoje há ${counts.total} ${appointmentWord} (${counts.pending} por confirmar):`)
                : (counts.pending === 0 ? `Hoje há ${counts.total} ${appointmentWord} e todos já estão confirmados ou atendidos:` : `Hoje há ${counts.total} ${appointmentWord} (${counts.pending} a confirmar):`);
          const lines = rows.map((row) => {
            const time = row.startAt.toLocaleTimeString(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', ...(isEn ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }) });
            return `• ${time} — ${row.patient} (${statusLabels[row.status as keyof typeof statusLabels] ?? row.status})`;
          });
          const suffix = counts.total > rows.length ? (isEn ? `\n…and ${counts.total - rows.length} more in Schedule.` : isEs ? `\n…y ${counts.total - rows.length} más en Agenda.` : isPtPt ? `\n…e mais ${counts.total - rows.length} na Agenda.` : `\n… e mais ${counts.total - rows.length} horário(s) na Agenda.`) : '';
          const tip = counts.pending > 0 ? (isEn ? '\n\nTo confirm one, say “confirm” and the patient’s name.' : isEs ? '\n\nPara confirmar una, diga «confirmar» y el nombre del paciente.' : isPtPt ? '\n\nPara confirmar uma, diga «confirmar» e o nome do paciente.' : '\n\nSe quiser confirmar algum deles, é só dizer “confirmar” e o nome do paciente.') : '';
          answer = `${header}\n\n${lines.join('\n')}${suffix}${tip}`;
        }
        return {
          answer,
          metrics: [{ label: isEn ? 'Today’s appointments' : isEs ? 'Citas de hoy' : isPtPt ? 'Marcações de hoje' : 'Agendamentos de hoje', value: counts.total }, { label: isEn ? 'Awaiting confirmation' : isEs ? 'Pendientes de confirmación' : isPtPt ? 'Por confirmar' : 'A confirmar', value: counts.pending }],
        };
      }
      case 'open_tasks': {
        const [total, items] = await Promise.all([
          this.db.task.count({ where: pendingTasks(id) }),
          this.db.task.findMany({
            where: pendingTasks(id),
            orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
            take: 6,
            select: { title: true, dueAt: true },
          }),
        ]);
        const answer = total === 0
          ? (isEn ? 'All tasks are up to date.' : isEs ? 'Todas las tareas están al día.' : isPtPt ? 'Por aqui, está tudo em dia nas tarefas.' : 'Por aqui, todas as tarefas estão em dia.')
          : [
              isEn ? (total === 1 ? 'There is 1 open task:' : `There are ${total} open tasks:`) : isEs ? (total === 1 ? 'Hay 1 tarea pendiente:' : `Hay ${total} tareas pendientes:`) : isPtPt ? (total === 1 ? 'Há 1 tarefa por concluir:' : `Há ${total} tarefas por concluir:`) : (total === 1 ? 'Há 1 tarefa em aberto:' : `Há ${total} tarefas em aberto:`),
              ...items.map((item) => `• ${item.title}${item.dueAt ? ` (${isEn ? 'due' : isEs ? 'vence' : isPtPt ? 'prazo' : 'prazo'}: ${item.dueAt.toLocaleString(locale, { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' })})` : ''}`),
              ...(total > items.length ? [isEn ? `… and ${total - items.length} more in Tasks.` : isEs ? `…y ${total - items.length} más en Tareas.` : isPtPt ? `…e mais ${total - items.length} em Tarefas.` : `… e mais ${total - items.length} em Tarefas.`] : []),
            ].join('\n');
        return {
          answer,
          metrics: [{ label: isEn ? 'Open tasks' : isEs ? 'Tareas pendientes' : isPtPt ? 'Tarefas por concluir' : 'Tarefas abertas', value: total }],
        };
      }
      case 'open_opportunities': {
        const [total, items] = await Promise.all([
          this.db.opportunity.count({ where: openOpportunities(id) }),
          this.db.opportunity.findMany({
            where: openOpportunities(id),
            orderBy: [{ createdAt: 'desc' }],
            take: 6,
            select: { title: true, stage: true, contact: { select: { name: true } } },
          }),
        ]);
        const answer = total === 0
          ? (isEn ? 'There are no open CRM opportunities right now.' : isEs ? 'No hay oportunidades abiertas en el CRM ahora mismo.' : isPtPt ? 'Não há oportunidades abertas no CRM neste momento.' : 'Não há oportunidades abertas no CRM no momento.')
          : [
              isEn ? (total === 1 ? 'There is 1 active CRM opportunity:' : `There are ${total} active CRM opportunities:`) : isEs ? (total === 1 ? 'Hay 1 oportunidad abierta en el CRM:' : `Hay ${total} oportunidades abiertas en el CRM:`) : isPtPt ? (total === 1 ? 'Há 1 oportunidade em aberto no CRM:' : `Há ${total} oportunidades em aberto no CRM:`) : (total === 1 ? 'Há 1 oportunidade em andamento no CRM:' : `Há ${total} oportunidades em andamento no CRM:`),
              ...items.map((item) => {
                const stage = isEn ? ({ NEW: 'New', CONTACTED: 'Contacted', BOOKED: 'Booked', WON: 'Won', LOST: 'Lost' }[item.stage] ?? item.stage)
                  : isEs ? ({ NEW: 'Nueva', CONTACTED: 'Contactada', BOOKED: 'Con cita', WON: 'Ganada', LOST: 'Perdida' }[item.stage] ?? item.stage)
                    : isPtPt ? ({ NEW: 'Nova', CONTACTED: 'Contactado', BOOKED: 'Marcada', WON: 'Convertida', LOST: 'Perdida' }[item.stage] ?? item.stage)
                      : (stageLabel[item.stage] ?? item.stage);
                return `• ${item.title} — ${item.contact.name} (${stage})`;
              }),
              ...(total > items.length ? [isEn ? `… and ${total - items.length} more in Inbox → Opportunities.` : isEs ? `…y ${total - items.length} más en Atención → Oportunidades.` : isPtPt ? `…e mais ${total - items.length} em Atendimento → Oportunidades.` : `… e mais ${total - items.length} em Atendimento → Oportunidades.`] : []),
            ].join('\n');
        return {
          answer,
          metrics: [{ label: isEn ? 'Open opportunities' : isEs ? 'Oportunidades abiertas' : isPtPt ? 'Oportunidades em aberto' : 'Oportunidades abertas', value: total }],
        };
      }
      case 'service_count': {
        const [total, items] = await Promise.all([
          this.db.service.count({ where: scope }),
          this.db.service.findMany({
            where: scope,
            orderBy: { name: 'asc' },
            take: 8,
            select: { name: true, durationMinutes: true, priceCents: true },
          }),
        ]);
        const answer = total === 0
          ? (isEn ? 'There are no services set up at the clinic yet.' : isEs ? 'Aún no hay servicios registrados en la clínica.' : isPtPt ? 'Ainda não há serviços registados na clínica.' : 'Ainda não há serviços cadastrados na clínica.')
          : [
              isEn ? (total === 1 ? 'The clinic has 1 service:' : `The clinic has ${total} services:`) : isEs ? (total === 1 ? 'La clínica tiene 1 servicio registrado:' : `La clínica tiene ${total} servicios registrados:`) : isPtPt ? (total === 1 ? 'A clínica tem 1 serviço registado:' : `A clínica tem ${total} serviços registados:`) : (total === 1 ? 'A clínica tem 1 serviço cadastrado:' : `A clínica tem ${total} serviços cadastrados:`),
              ...items.map((item) => `• ${item.name} — ${item.durationMinutes} min · ${new Intl.NumberFormat(locale, { style: 'currency', currency }).format(item.priceCents / 100)}`),
              ...(total > items.length ? [isEn ? `… and ${total - items.length} more in Settings → Services.` : isEs ? `…y ${total - items.length} más en Configuración → Servicios.` : isPtPt ? `…e mais ${total - items.length} em Configurações → Serviços.` : `… e mais ${total - items.length} em Configurações → Serviços.`] : []),
            ].join('\n');
        return {
          answer,
          metrics: [{ label: isEn ? 'Services' : isEs ? 'Servicios' : isPtPt ? 'Serviços registados' : 'Serviços cadastrados', value: total }],
        };
      }
      case 'clinic_metrics': {
        const metrics = await readClinicMetrics(this.db, id, timezone);
        return {
          answer: isEn ? `Clinic overview: ${metrics.appointments} appointments today, ${metrics.patients} patients, ${metrics.contacts} contacts, ${metrics.opportunities} open opportunities, and ${metrics.tasks} pending tasks.` : isEs ? `Resumen de la clínica: ${metrics.appointments} citas hoy, ${metrics.patients} pacientes, ${metrics.contacts} contactos, ${metrics.opportunities} oportunidades abiertas y ${metrics.tasks} tareas pendientes.` : isPtPt ? `Resumo da clínica: ${metrics.appointments} marcações hoje, ${metrics.patients} pacientes, ${metrics.contacts} contactos, ${metrics.opportunities} oportunidades em aberto e ${metrics.tasks} tarefas pendentes.` : `Resumo geral da clínica: ${metrics.appointments} agendamento(s) hoje, ${metrics.patients} paciente(s), ${metrics.contacts} contato(s), ${metrics.opportunities} oportunidade(s) aberta(s) e ${metrics.tasks} tarefa(s) pendente(s).`,
          metrics: [
            { label: isEn ? 'Today’s appointments' : isEs ? 'Citas de hoy' : isPtPt ? 'Marcações de hoje' : 'Agendamentos de hoje', value: metrics.appointments },
            { label: isEn ? 'Patients' : isEs ? 'Pacientes' : 'Pacientes cadastrados', value: metrics.patients },
            { label: isEn ? 'Contacts' : isEs ? 'Contactos' : isPtPt ? 'Contactos' : 'Contatos cadastrados', value: metrics.contacts },
            { label: isEn ? 'Open opportunities' : isEs ? 'Oportunidades abiertas' : isPtPt ? 'Oportunidades em aberto' : 'Oportunidades abertas', value: metrics.opportunities },
            { label: isEn ? 'Open tasks' : isEs ? 'Tareas pendientes' : isPtPt ? 'Tarefas pendentes' : 'Tarefas abertas', value: metrics.tasks },
          ],
        };
      }
    }
  }
}
