import type { ModelRequest } from '@clinicas/ai-core';
import { z } from 'zod';

export const consultationIntents = [
  'agenda_today', 'open_tasks', 'open_opportunities', 'clinic_metrics', 'service_count', 'daily_summary',
] as const;
export type ConsultationIntent = (typeof consultationIntents)[number];

export const consultationBody = z.strictObject({ intent: z.enum(consultationIntents) });

export const consultations = {
  agenda_today: { agentId: 'agenda', instruction: 'Consultar a agenda administrativa de hoje.' },
  open_tasks: { agentId: 'operations', instruction: 'Consultar as tarefas administrativas que estão em aberto.' },
  open_opportunities: { agentId: 'crm', instruction: 'Consultar as oportunidades em aberto no CRM.' },
  clinic_metrics: { agentId: 'main', instruction: 'Consultar os indicadores administrativos gerais.' },
  daily_summary: { agentId: 'main', instruction: 'Montar o resumo do dia: reunir agenda de hoje a confirmar, oportunidades e tarefas em aberto em uma resposta.' },
  service_count: { agentId: 'operations', instruction: 'Consultar a quantidade de serviços cadastrados.' },
} as const satisfies Record<ConsultationIntent, { agentId: string; instruction: string }>;

export function planRequest(intent: ConsultationIntent): ModelRequest {
  return {
    tier: 'standard',
    instructions: 'Você é o Agente Principal da Clara. Escolha a ferramenta de consulta administrativa que corresponde à solicitação e retorne o ID no campo tool. Não gere texto adicional nem parâmetros.',
    turns: [{ role: 'user', text: consultations[intent].instruction }],
    tools: [],
    maxOutputTokens: 256,
    timeoutMs: 18_000,
    outputSchema: {
      type: 'object',
      properties: { tool: { type: 'string', enum: [...consultationIntents] } },
      required: ['tool'],
    },
  };
}

export function proposedTool(value: unknown, intent: ConsultationIntent) {
  const parsed = z.strictObject({ tool: z.literal(intent) }).safeParse(value);
  return parsed.success ? parsed.data.tool : undefined;
}
