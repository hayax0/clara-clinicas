import type { ModelRequest } from '@clinicas/ai-core';
import { z } from 'zod';
import type { ChatAgentId } from './assistant-routing.js';

export const brainTools = [
  'daily_summary',
  'agenda_today',
  'agenda_schedule',
  'patient_overview',
  'open_tasks',
  'open_opportunities',
  'clinic_metrics',
  'service_count',
  'finance_month',
] as const;

export type BrainTool = (typeof brainTools)[number];

export const brainDecisionSchema = z.object({
  action: z.enum([
    'consult',
    'start_booking',
    'confirm_appointment',
    'cancel_appointment',
    'register_patient',
    'register_clinic_item',
    'propose_task',
    'reply',
  ]),
  tool: z.enum(brainTools).optional(),
  patientName: z.string().trim().min(2).max(120).optional(),
  itemKind: z.enum(['service', 'professional', 'unit']).optional(),
  itemName: z.string().trim().min(2).max(120).optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  priceReais: z.number().min(0).max(1_000_000).optional(),
  specialty: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().min(2).max(200).optional(),
  dateText: z.string().trim().min(1).max(40).optional(),
  timeText: z.string().trim().min(1).max(20).optional(),
  taskTitle: z.string().trim().min(2).max(120).optional(),
  reply: z.string().trim().min(1).max(900).optional(),
});

export type BrainDecision = z.infer<typeof brainDecisionSchema>;

const agentDescriptions: Record<ChatAgentId, { name: string; scope: string; tools: readonly BrainTool[] }> = {
  main: {
    name: 'Agente Principal da Clara',
    scope: 'Coordena toda a rotina administrativa da clínica: agenda (hoje, amanhã, semana ou data específica; marcar, confirmar e cancelar consultas; ficha de pacientes e pacotes ativos), tarefas, CRM/oportunidades, serviços, indicadores e resumo financeiro do mês.',
    tools: brainTools,
  },
  agenda: {
    name: 'Assistente de Agenda da Clara',
    scope: 'Cuida dos agendamentos da clínica: consultar a agenda de hoje, amanhã, da semana ou de uma data específica, ver a ficha administrativa e pacotes do paciente, marcar novas consultas, confirmar ou cancelar agendamentos existentes e cadastrar pacientes.',
    tools: ['agenda_today', 'agenda_schedule', 'patient_overview'],
  },
  crm: {
    name: 'Assistente de CRM da Clara',
    scope: 'Cuida das oportunidades comerciais, contatos, retornos, ficha administrativa de pacientes e cadastro de pacientes.',
    tools: ['open_opportunities', 'patient_overview'],
  },
  operations: {
    name: 'Assistente de Operações da Clara',
    scope: 'Cuida das tarefas da equipe, catálogo de serviços, cadastro de pacientes e resumo financeiro do mês (recebimentos por forma de pagamento e contas vencidas).',
    tools: ['open_tasks', 'service_count', 'finance_month'],
  },
};

export function sanitizeForModel(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[telefone]');
}

export function buildBrainRequest(params: {
  agentId: ChatAgentId;
  clinicName: string;
  locale?: string;
  currency?: string;
  history: { userText: string; answer: string }[];
  notes: string[];
  message: string;
  preferBrief: boolean;
}): ModelRequest {
  const profile = agentDescriptions[params.agentId];
  const allowedTools = profile.tools;
  const clinicLocale = params.locale ?? 'pt-BR';
  const clinicCurrency = params.currency ?? 'BRL';
  const languageInstruction = clinicLocale === 'en-US'
    ? `Clinic language: international English (en-US). Clinic currency: ${clinicCurrency}. Reply in natural, polite, professional English and format money in ${clinicCurrency}.`
    : clinicLocale === 'es-ES'
      ? `Idioma de la clínica: español de España (es-ES). Moneda: ${clinicCurrency}. Responde en español natural, cordial y profesional, y presenta los importes en ${clinicCurrency}.`
      : clinicLocale === 'pt-PT'
        ? `Idioma da clínica: português europeu (pt-PT). Moeda: ${clinicCurrency}. Responda em português de Portugal, de forma natural, cordial e profissional, e formate valores em ${clinicCurrency}.`
        : `Idioma da clínica: português do Brasil (pt-BR). Moeda: ${clinicCurrency}. Fale como uma pessoa experiente, educada, natural e objetiva de receção/gestão de clínica no Brasil. Formate valores em ${clinicCurrency}.`;
  const recent = params.history.slice(-6).flatMap((turn) => [
    { role: 'user' as const, text: sanitizeForModel(turn.userText) },
    { role: 'model' as const, text: sanitizeForModel(turn.answer) },
  ]);

  const instructions = [
    `Você é o ${profile.name}, assistente administrativo da clínica "${params.clinicName}" no sistema Clara.`,
    `Escopo deste assistente: ${profile.scope}`,
    languageInstruction,
    'Regras obrigatórias:',
    '1. NUNCA invente números, horários, pacientes, valores ou ações que não aconteceram. Para consultar dados reais da clínica, escolha action="consult" com uma ferramenta permitida.',
    '2. NUNCA dê diagnóstico, conduta clínica, prescrição ou orientação médica. Se perguntarem algo clínico, responda com action="reply" orientando a falar com o profissional de saúde responsável.',
    '3. Use o histórico recente da conversa! Se o usuário citou um nome de paciente, data ou assunto na mensagem anterior e agora complementou ("quero agendar ela", "pode ser amanhã às 15h", "confirma ela"), aproveite esse contexto nos campos patientName/dateText/timeText.',
    '4. Ações disponíveis:',
    '   - action="consult": para ler dados reais do banco. Ferramentas permitidas aqui: ' + allowedTools.join(', ') + '.',
    '     * daily_summary: resumo completo do dia (agenda, CRM e tarefas).',
    '     * agenda_today: listar agendamentos de hoje, quem falta confirmar, horários ocupados.',
    '     * agenda_schedule: listar agendamentos de amanhã, desta semana ou de uma data específica (preencha dateText com "amanha", "semana" ou "DD/MM").',
    '     * patient_overview: consultar informações administrativas de um paciente (contato, próximos agendamentos e pacotes/sessões ativos — preencha patientName).',
    '     * open_tasks: listar tarefas abertas.',
    '     * open_opportunities: listar oportunidades em aberto no CRM.',
    '     * service_count: listar serviços cadastrados.',
    '     * clinic_metrics: visão geral/indicadores da clínica.',
    '     * finance_month: resumo financeiro do mês atual (recebido, pago, saldo, pendentes, recebimentos por forma de pagamento como Pix/Cartão/Dinheiro e contas vencidas a receber/pagar).',
    ...(params.agentId === 'main' || params.agentId === 'agenda'
      ? [
          '   - action="start_booking": quando o usuário quer marcar/agendar/encaixar uma consulta (extraia patientName, dateText, timeText se houver no pedido ou no histórico imediato).',
          '   - action="confirm_appointment": quando o usuário quer confirmar o agendamento de um paciente ou confirmar horários pendentes (extraia patientName se citado).',
          '   - action="cancel_appointment": quando o usuário quer cancelar/desmarcar um agendamento existente (extraia patientName se citado).',
        ]
      : []),
    '   - action="register_patient": quando o usuário quer apenas cadastrar um novo paciente (extraia patientName se citado).',
    ...(params.agentId === 'main' || params.agentId === 'agenda' || params.agentId === 'operations'
      ? ['   - action="register_clinic_item": quando o usuário quer cadastrar um serviço, profissional ou unidade da clínica (defina itemKind="service"|"professional"|"unit", e extraia itemName, durationMinutes, priceReais, specialty ou address se informados).']
      : []),
    ...(params.agentId === 'main' || params.agentId === 'operations'
      ? ['   - action="propose_task": quando o usuário quer criar/lembrar uma nova tarefa para a equipe (extraia taskTitle).']
      : []),
    '   - action="reply": para conversar normalmente, tirar dúvidas sobre como usar a Clara (Agenda, Pacientes, Atendimento/CRM/Retornos/Campanhas manuais por WhatsApp, Financeiro, Tarefas, Configurações), pedir esclarecimento de forma humana ou redirecionar gentilmente quando o pedido pertence a outro ajudante.',
    params.preferBrief ? 'Preferência do usuário: seja especialmente breve e direto ao ponto.' : 'Responda de forma clara, natural e concisa.',
    ...(params.notes.length
      ? [`Preferências de trabalho salvas pelo usuário: ${params.notes.slice(0, 5).map(sanitizeForModel).join(' | ')}`]
      : []),
    'Retorne SOMENTE JSON válido seguindo o schema.',
  ].join('\n');

  return {
    tier: 'standard',
    instructions,
    turns: [...recent, { role: 'user', text: sanitizeForModel(params.message) }],
    tools: [],
    maxOutputTokens: 384,
    timeoutMs: 14_000,
    outputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'consult',
            'start_booking',
            'confirm_appointment',
            'cancel_appointment',
            'register_patient',
            'register_clinic_item',
            'propose_task',
            'reply',
          ],
        },
        tool: { type: 'string', enum: [...allowedTools] },
        patientName: { type: 'string' },
        itemKind: { type: 'string', enum: ['service', 'professional', 'unit'] },
        itemName: { type: 'string' },
        durationMinutes: { type: 'integer' },
        priceReais: { type: 'number' },
        specialty: { type: 'string' },
        address: { type: 'string' },
        dateText: { type: 'string' },
        timeText: { type: 'string' },
        taskTitle: { type: 'string' },
        reply: { type: 'string' },
      },
      required: ['action'],
    },
  };
}

export function parseBrainDecision(value: unknown): BrainDecision | undefined {
  const parsed = brainDecisionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
