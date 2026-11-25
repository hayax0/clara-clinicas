import { z } from 'zod';
import type { Database } from '../database.js';
import { lockChatAccess } from './assistant-actions.js';

type Scope = { organizationId: string; actorId: string; agentId: string };

const proposalState = z.object({
  kind: z.enum(['confirm', 'cancel']),
  appointmentId: z.uuid().optional(),
  patientName: z.string().optional(),
  summary: z.string().optional(),
  candidates: z.array(z.object({
    appointmentId: z.uuid(),
    patientName: z.string(),
    summary: z.string(),
    time: z.string(),
  })).optional(),
});

const turnSelect = {
  id: true, userText: true, answer: true, responderId: true, metrics: true, createdAt: true, tool: true, proposalExpiresAt: true,
} as const;

const clean = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function stripGreeting(text: string) {
  return clean(text).replace(/^(?:(?:ola|oi|e ai|bom dia|boa tarde|boa noite|clara|agenda|por favor)[,!. ]+)+/, '').trim();
}

function isAffirmative(msg: string) {
  return /^(?:sim|s|yes|y|ok|okay|sure|claro|pode|pode sim|beleza|show|isso|exato|perfeito|confirmo|confirmar|confirme|confirma|confirm|confirm it|pode confirmar|pode cancelar|manda ver|fechado)(?:[,! ]+(?:pode|por favor|please|sim|yes|confirma|confirmar|confirm|cancelar|cancel))?$/.test(msg);
}

function isNegative(msg: string) {
  return /^(?:nao|n|no|nope|cancelar|cancele|cancela|cancel|descartar|descarte|deixa pra la|esquece|melhor nao)(?: o (?:pedido|cancelamento|confirmacao))?$/.test(msg);
}

export function detectAppointmentAction(text: string): { kind: 'confirm' | 'cancel'; patientHint?: string } | undefined {
  const raw = text.trim();
  const stripped = stripGreeting(raw);
  if (!stripped) return undefined;
  // Never steal FAQ questions or counts/lists ("como confirmo...", "quantos faltam confirmar?", "quais faltam confirmar?")
  if (/^(?:como|onde|quant[oa]s?|quais|quem|tem algum|falta confirmar|faltam confirmar|how|where|what|who|cu[aá]ntos?|cu[aá]les|qui[eé]n|hay alguna)\b/.test(stripped)) return undefined;
  if (/\b(?:tarefa|task|retorno|retornos|seguimiento|seguimientos|follow.?ups?|cadastro|cadastrar|registro|registrar)\b/.test(stripped)) return undefined;
  // Avoid stealing explicit booking creation requests
  if (/\b(?:agendar|marcar|reservar|fazer (?:um )?agendamento|novo agendamento|schedule|book|programar)\b/.test(stripped)) return undefined;

  const isConfirmVerb = /\b(?:confirm[aeo]?|confirmar|marcar como confirmad[oa]|deixa(?:r)? confirmad[oa]|confirmou)\b/.test(stripped);
  const isCancelVerb = /\b(?:cancel[aeo]?|cancelar|desmarc[aeou]|desmarcar)\b/.test(stripped);
  if (!isConfirmVerb && !isCancelVerb) return undefined;

  // Exclude generic "confirmar o agendamento" / "cancelar o agendamento" (used during booking/task flows)
  if (/^(?:sim[, ]+|yes[, ]+)?(?:confirmar?|confirme|confirmo|cancelar?|cancele|cancela)(?: o| a| the|la)? (?:agendamento|consulta|horario|appointment|cita|marcacao|cadastro|tarefa|task|retorno|seguimiento|follow.?up)$/.test(stripped)) {
    return undefined;
  }

  const kind: 'confirm' | 'cancel' = isCancelVerb && !isConfirmVerb ? 'cancel' : 'confirm';
  const hint = extractPatientHint(raw, kind);
  // Require either a patient hint or explicit appointment word so casual words like "confirma isso" don't hijack other flows
  const mentionsAppointment = /\b(?:paciente|patient|consulta|agendamento|appointment|horario|atendimento|cita|marcacao)\b/.test(stripped);
  if (!hint && !mentionsAppointment) return undefined;
  return { kind, patientHint: hint };
}

function extractPatientHint(raw: string, kind: 'confirm' | 'cancel'): string | undefined {
  const withoutGreeting = raw.trim().replace(/^(?:(?:ol[aá]|oi|e a[ií]|bom dia|boa tarde|boa noite|clara|agenda|por favor)[,!. ]+)+/iu, '').trim();
  const patterns = kind === 'confirm'
    ? [
        /(?:pode |quero |preciso |please )?(?:confirm[aeo]?|confirmar|marcar como confirmad[oa]|deixar confirmad[oa])\s+(?:a consulta |o agendamento |o hor[aá]rio |o atendimento |the appointment |la cita |a marcacion |a marcação )?(?:(?:de|da|do|para|pra|for)\s+)?(?:(?:a|o|the|la)\s+)?(?:(?:paciente|patient)\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})/iu,
        /(?:(?:a|o)\s+)?(?:paciente\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})\s+confirmou\b/iu,
      ]
    : [
        /(?:pode |quero |preciso |please )?(?:cancel[aeo]?|cancelar|desmarc[aeo]|desmarcar)\s+(?:a consulta |o agendamento |o hor[aá]rio |o atendimento |the appointment |la cita |a marcacion |a marcação )?(?:(?:de|da|do|para|pra|for|de la)\s+)?(?:(?:a|o|the|la)\s+)?(?:(?:paciente|patient)\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})/iu,
        /(?:(?:a|o)\s+)?(?:paciente\s+)?([\p{L}][\p{L}\p{M} '’-]{1,80})\s+(?:desmarcou|cancelou)\b/iu,
      ];

  for (const pattern of patterns) {
    const match = pattern.exec(withoutGreeting);
    if (!match?.[1]) continue;
    const cleaned = match[1]
      .replace(/\b(?:de hoje|hoje|amanh[aã]|agora|por favor|da agenda|na agenda|como confirmad[oa]|como cancelad[oa]|consulta|agendamento|hor[aá]rio|atendimento)\b.*$/iu, '')
      .replace(/[.!?,;:]+$/g, '')
      .trim();
    const norm = clean(cleaned);
    if (!cleaned || cleaned.length < 2) continue;
    if (/^(?:a|o|um|uma|consulta|agendamento|horario|atendimento|paciente|ele|ela|hoje|amanha|todos|todas|esse|essa|este|esta)$/.test(norm)) {
      continue;
    }
    return cleaned;
  }
  return undefined;
}

function formatSlot(date: Date, timezone: string, locale: string) {
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', ...(locale === 'en-US' ? { hourCycle: 'h12' as const } : { hourCycle: 'h23' as const }),
  }).format(date);
  const connector = locale === 'en-US' ? ' at ' : locale === 'es-ES' ? ' a las ' : ' às ';
  return { day, time, label: `${day}${connector}${time}` };
}

function matchPatient(patientName: string, queryText: string, hint?: string) {
  const target = clean(patientName);
  const msg = clean(queryText);
  if (hint) {
    const cleanHint = clean(hint);
    if (target === cleanHint) return 3;
    if (target.startsWith(cleanHint) || (` ${target} `).includes(` ${cleanHint} `)) return 2;
    if (cleanHint.includes(target)) return 2;
  }
  if ((` ${msg} `).includes(` ${target} `)) return 2;
  return 0;
}

export async function handleAppointmentAction(
  db: Database,
  scope: Scope,
  turnId: string,
  text: string,
  timezone: string,
  explicit?: { kind: 'confirm' | 'cancel'; patientHint?: string },
  locale = 'pt-BR',
) {
  if (!['main', 'agenda'].includes(scope.agentId)) return undefined;
  const detected = explicit ?? detectAppointmentAction(text);
  const pendingWhere = {
    ...scope,
    tool: { in: ['appointment_confirm_proposal', 'appointment_cancel_proposal', 'appointment_select_proposal'] },
    proposalExpiresAt: { gt: new Date() },
  };
  const hasPending = Boolean(await db.assistantTurn.findFirst({ where: pendingWhere, select: { id: true } }));
  if (!detected && !hasPending) return undefined;

  return db.$transaction(async (tx) => {
    await lockChatAccess(tx, scope);
    const isEn = locale === 'en-US';
    const isEs = locale === 'es-ES';
    const isPtPt = locale === 'pt-PT';
    const prev = await tx.assistantTurn.findFirst({ where: pendingWhere, orderBy: { createdAt: 'desc' } });
    if (!prev && !detected) return undefined;

    const reply = (
      answer: string,
      tool: string,
      draft?: z.infer<typeof proposalState>,
    ) => tx.assistantTurn.update({
      where: { id: turnId },
      data: {
        answer,
        responderId: 'agenda',
        tool,
        metrics: [],
        ...(draft && { actionDraft: draft, proposalExpiresAt: new Date(Date.now() + 900_000) }),
      },
      select: turnSelect,
    });

    const msg = clean(text).replace(/[.!?]+$/, '');

    // Handle active proposal follow-up
    if (prev && !explicit) {
      const prior = proposalState.safeParse(prev.actionDraft);
      if (prior.success) {
        const state = prior.data;
        if (isNegative(msg)) {
          await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
          return reply(isEn ? 'All right, I left the appointment unchanged.' : isEs ? 'De acuerdo, he dejado la cita como estaba.' : isPtPt ? 'Está bem, mantive a marcação como estava.' : 'Tudo bem, mantive o agendamento como estava.', 'appointment_action_cancelled');
        }

        // Choosing among multiple candidates
        if (state.candidates?.length && !state.appointmentId) {
          const indexMatch = /^(?:op[cç][aã]o\s*)?(\d+)$/i.exec(msg);
          let chosen = indexMatch ? state.candidates[Number(indexMatch[1]) - 1] : undefined;
          if (!chosen) {
            const byMatch = state.candidates.filter((item) =>
              msg.includes(clean(item.patientName)) || msg.includes(item.time) || msg.includes(item.time.replace(':00', 'h')),
            );
            if (byMatch.length === 1) chosen = byMatch[0];
          }
          if (chosen) {
            await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
            const actionVerb = state.kind === 'confirm'
              ? (isEn ? 'confirm' : isEs ? 'confirme' : isPtPt ? 'confirme' : 'confirmar')
              : (isEn ? 'cancel' : isEs ? 'cancele' : isPtPt ? 'cancele' : 'cancelar');
            return reply(
              isEn ? `I found ${chosen.patientName}'s appointment (${chosen.summary}). Would you like me to ${actionVerb} it?`
                : isEs ? `He encontrado la cita de ${chosen.patientName} (${chosen.summary}). ¿Quiere que la ${actionVerb}?`
                  : isPtPt ? `Encontrei a marcação de ${chosen.patientName} (${chosen.summary}). Quer que a ${actionVerb}?`
                    : `Encontrei o agendamento de ${chosen.patientName} (${chosen.summary}). Posso ${actionVerb}?`,
              state.kind === 'confirm' ? 'appointment_confirm_proposal' : 'appointment_cancel_proposal',
              { kind: state.kind, appointmentId: chosen.appointmentId, patientName: chosen.patientName, summary: chosen.summary },
            );
          }
          // If the user started a completely different request, expire the pending selection and let other handlers run
          if (!detected) {
            await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
            return undefined;
          }
        }

        // Confirming a single proposed appointment change
        if (state.appointmentId && isAffirmative(msg)) {
          await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
          const nextStatus = state.kind === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
          const allowedCurrent = state.kind === 'confirm' ? ['SCHEDULED'] as const : ['SCHEDULED', 'CONFIRMED'] as const;
          const updated = await tx.appointment.updateMany({
            where: { id: state.appointmentId, organizationId: scope.organizationId, status: { in: [...allowedCurrent] } },
            data: { status: nextStatus },
          });
          if (!updated.count) {
            return reply(
              state.kind === 'confirm'
                ? (isEn ? 'This appointment was already confirmed or changed recently.' : isEs ? 'Esta cita ya estaba confirmada o se ha modificado recientemente.' : isPtPt ? 'Esta marcação já estava confirmada ou foi alterada recentemente.' : 'Esse agendamento já estava confirmado ou foi alterado recentemente.')
                : (isEn ? 'This appointment was already cancelled or completed.' : isEs ? 'Esta cita ya estaba cancelada o finalizada.' : isPtPt ? 'Esta marcação já estava cancelada ou concluída.' : 'Esse agendamento já estava cancelado ou concluído.'),
              'appointment_action_unchanged',
            );
          }
          await tx.auditEvent.create({
            data: {
              organizationId: scope.organizationId,
              actorId: scope.actorId,
              action: state.kind === 'confirm' ? 'assistant.appointment.confirmed' : 'assistant.appointment.cancelled',
              resourceId: state.appointmentId,
            },
          });
          return reply(
            state.kind === 'confirm'
              ? (isEn ? `Done! ${state.patientName}'s appointment (${state.summary}) has been confirmed.` : isEs ? `¡Listo! La cita de ${state.patientName} (${state.summary}) se ha confirmado.` : isPtPt ? `Pronto! A marcação de ${state.patientName} (${state.summary}) foi confirmada.` : `Pronto! O agendamento de ${state.patientName} (${state.summary}) foi confirmado.`)
              : (isEn ? `Done! ${state.patientName}'s appointment (${state.summary}) has been cancelled.` : isEs ? `¡Listo! La cita de ${state.patientName} (${state.summary}) se ha cancelado.` : isPtPt ? `Pronto! A marcação de ${state.patientName} (${state.summary}) foi cancelada.` : `Pronto! O agendamento de ${state.patientName} (${state.summary}) foi cancelado.`),
            state.kind === 'confirm' ? 'appointment_confirmed' : 'appointment_cancelled',
          );
        }

        // If user sent something unrelated while a proposal was waiting, clear old proposal and let pipeline continue
        if (!detected) {
          await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
          return undefined;
        }
      }
      await tx.assistantTurn.update({ where: { id: prev.id }, data: { proposalExpiresAt: null } });
    }

    if (!detected) return undefined;

    const { kind, patientHint } = detected;
    const [dayStart] = await tx.$queryRaw<{ start: Date }[]>`
      SELECT (date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}) AS start
    `;
    const eligibleStatuses = kind === 'confirm' ? (['SCHEDULED'] as const) : (['SCHEDULED', 'CONFIRMED'] as const);
    const appointments = await tx.appointment.findMany({
      where: {
        organizationId: scope.organizationId,
        status: { in: [...eligibleStatuses] },
        startAt: { gte: dayStart.start },
      },
      orderBy: { startAt: 'asc' },
      take: 50,
      select: {
        id: true,
        startAt: true,
        status: true,
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    if (patientHint) {
      const scored = appointments
        .map((item) => ({ item, score: matchPatient(item.patient.name, text, patientHint) }))
        .filter((entry) => entry.score > 0);
      const bestScore = scored.reduce((max, entry) => Math.max(max, entry.score), 0);
      const matches = scored.filter((entry) => entry.score === bestScore).map((entry) => entry.item);

      if (matches.length === 1) {
        const chosen = matches[0];
        const slot = formatSlot(chosen.startAt, timezone, locale);
        const summary = `${slot.label} · ${chosen.service.name} ${isEn ? 'with' : isEs ? 'con' : 'com'} ${chosen.professional.name}`;
        const actionVerb = kind === 'confirm'
          ? (isEn ? 'confirm' : isEs ? 'confirme' : isPtPt ? 'confirme' : 'confirmar')
          : (isEn ? 'cancel' : isEs ? 'cancele' : isPtPt ? 'cancele' : 'cancelar');
        return reply(
          isEn ? `I found ${chosen.patient.name}'s appointment on ${summary}. Would you like me to ${actionVerb} it?`
            : isEs ? `He encontrado la cita de ${chosen.patient.name} para ${summary}. ¿Quiere que la ${actionVerb}?`
              : isPtPt ? `Encontrei a marcação de ${chosen.patient.name} para ${summary}. Quer que a ${actionVerb}?`
                : `Encontrei o agendamento de ${chosen.patient.name} em ${summary}. Posso ${actionVerb}?`,
          kind === 'confirm' ? 'appointment_confirm_proposal' : 'appointment_cancel_proposal',
          { kind, appointmentId: chosen.id, patientName: chosen.patient.name, summary },
        );
      }

      if (matches.length > 1) {
        const candidates = matches.slice(0, 6).map((item) => {
          const slot = formatSlot(item.startAt, timezone, locale);
          return {
            appointmentId: item.id,
            patientName: item.patient.name,
            summary: `${slot.label} · ${item.service.name}`,
            time: slot.time,
          };
        });
        const list = candidates.map((item, idx) => `${idx + 1}. ${item.patientName} — ${item.summary}`).join('\n');
        return reply(
          isEn ? `I found more than one appointment for ${patientHint}. Which one would you like to ${kind === 'confirm' ? 'confirm' : 'cancel'}?\n\n${list}`
            : isEs ? `He encontrado más de una cita para ${patientHint}. ¿Cuál quiere ${kind === 'confirm' ? 'confirmar' : 'cancelar'}?\n\n${list}`
              : isPtPt ? `Encontrei mais do que uma marcação para ${patientHint}. Qual pretende ${kind === 'confirm' ? 'confirmar' : 'cancelar'}?\n\n${list}`
                : `Encontrei mais de um agendamento para ${patientHint}. Qual deles você quer ${kind === 'confirm' ? 'confirmar' : 'cancelar'}?\n\n${list}`,
          'appointment_select_proposal',
          { kind, candidates },
        );
      }

      // Check if the appointment already exists as CONFIRMED (for confirm requests)
      if (kind === 'confirm') {
        const alreadyConfirmed = await tx.appointment.findMany({
          where: { organizationId: scope.organizationId, status: 'CONFIRMED', startAt: { gte: dayStart.start } },
          orderBy: { startAt: 'asc' },
          take: 30,
          select: { startAt: true, patient: { select: { name: true } }, service: { select: { name: true } } },
        });
        const confirmedMatch = alreadyConfirmed.find((item) => matchPatient(item.patient.name, text, patientHint) > 0);
        if (confirmedMatch) {
          const slot = formatSlot(confirmedMatch.startAt, timezone, locale);
          return reply(
            isEn ? `${confirmedMatch.patient.name}'s appointment at ${slot.label} (${confirmedMatch.service.name}) is already confirmed.`
              : isEs ? `La cita de ${confirmedMatch.patient.name} del ${slot.label} (${confirmedMatch.service.name}) ya está confirmada.`
                : isPtPt ? `A marcação de ${confirmedMatch.patient.name} para ${slot.label} (${confirmedMatch.service.name}) já está confirmada.`
                  : `O agendamento de ${confirmedMatch.patient.name} em ${slot.label} (${confirmedMatch.service.name}) já está confirmado.`,
            'appointment_already_confirmed',
          );
        }
      }

      return reply(
        kind === 'confirm'
          ? (isEn ? `I couldn't find an appointment awaiting confirmation for ${patientHint} from today onward. I can schedule one if needed.` : isEs ? `No he encontrado ninguna cita pendiente de confirmación para ${patientHint} a partir de hoy.` : isPtPt ? `Não encontrei nenhuma marcação por confirmar para ${patientHint} a partir de hoje. Posso marcar uma, se precisar.` : `Não encontrei nenhum agendamento pendente para ${patientHint} a partir de hoje. Se quiser, posso agendar um horário para ela agora.`)
          : (isEn ? `I couldn't find an active appointment for ${patientHint} from today onward.` : isEs ? `No he encontrado ninguna cita activa para ${patientHint} a partir de hoy.` : isPtPt ? `Não encontrei nenhuma marcação ativa para ${patientHint} a partir de hoje.` : `Não encontrei nenhum agendamento ativo para ${patientHint} a partir de hoje.`),
        'appointment_not_found',
      );
    }

    // No patient specified: list upcoming pending appointments so the user can choose naturally
    if (!appointments.length) {
      return reply(
        kind === 'confirm'
          ? (isEn ? 'There are no appointments awaiting confirmation from today onward.' : isEs ? 'No hay citas pendientes de confirmación a partir de hoy.' : isPtPt ? 'Não há marcações por confirmar a partir de hoje.' : 'Não há agendamentos pendentes de confirmação a partir de hoje.')
          : (isEn ? 'There are no active appointments to cancel from today onward.' : isEs ? 'No hay citas activas que cancelar a partir de hoy.' : isPtPt ? 'Não há marcações ativas para cancelar a partir de hoje.' : 'Não há agendamentos ativos para cancelar a partir de hoje.'),
        'appointment_none',
      );
    }

    const candidates = appointments.slice(0, 6).map((item) => {
      const slot = formatSlot(item.startAt, timezone, locale);
      return {
        appointmentId: item.id,
        patientName: item.patient.name,
        summary: `${slot.label} · ${item.service.name}`,
        time: slot.time,
      };
    });
    const list = candidates.map((item, idx) => `${idx + 1}. ${item.patientName} — ${item.summary}`).join('\n');
    return reply(
      isEn ? `These appointments are ${kind === 'confirm' ? 'awaiting confirmation' : 'active'}. Which one would you like to ${kind === 'confirm' ? 'confirm' : 'cancel'}? Reply with its number or the patient's name.\n\n${list}`
        : isEs ? `Estas citas están ${kind === 'confirm' ? 'pendientes de confirmación' : 'activas'}. ¿Cuál quiere ${kind === 'confirm' ? 'confirmar' : 'cancelar'}? Responda con el número o el nombre del paciente.\n\n${list}`
          : isPtPt ? `Estas marcações estão ${kind === 'confirm' ? 'por confirmar' : 'ativas'}. Qual pretende ${kind === 'confirm' ? 'confirmar' : 'cancelar'}? Responda com o número ou o nome do paciente.\n\n${list}`
            : `Estes agendamentos estão ${kind === 'confirm' ? 'aguardando confirmação' : 'ativos'}. Qual você quer ${kind === 'confirm' ? 'confirmar' : 'cancelar'}? Pode responder com o número ou o nome do paciente.\n\n${list}`,
      'appointment_select_proposal',
      { kind, candidates },
    );
  });
}
