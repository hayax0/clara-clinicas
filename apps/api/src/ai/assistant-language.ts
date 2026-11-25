import type { ModelRequest } from '@clinicas/ai-core';
import type { ConsultationIntent } from './assistant-plan.js';
import { z } from 'zod';

function normalizeMessage(message: string) {
  return message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function briefForTurn(message: string): boolean | undefined {
  const text = normalizeMessage(message);
  if (/\b(com detalhes|detalhad[oa]s?|em detalhes|explica melhor|passo a passo|versao completa)\b/.test(text)) return false;
  if (/\b(curt[oa]s?|brev[e]s?|rapid[oa]s?|rapidinho|resumid[oa]s?|direto ao ponto|sem enrolac[a]o|sem detalhes|so os numeros|em poucas palavras)\b/.test(text)) return true;
  return undefined;
}

const cues = [
  ['overview', /\b(resum\w*|panorama|visao|geral|balanco|andamento)\b/],
  ['today', /\b(hoje|dia|agora|manha|tarde)\b/],
  ['attention', /\b(prioridad\w*|urgenc\w*|atenc\w*|resolver|adiantar|fazer|falta|resta|penden\w*)\b/],
  ['follow_up', /^(e\b|ainda\b)|\b(continua\w*|atualiz\w*|desses|dessas|daqueles|daquelas|mesmos?|mesmas?|de novo)\b/],
  ['schedule', /\b(agenda\w*|atendimentos?|horarios?|consultas?|marcados?|confirm\w*)\b/],
  ['opportunities', /\b(crm|oportunidades?|leads?|interessados?|prospecc\w*|comerciais|funil|negociac\w*)\b/],
  ['tasks', /\b(tarefas?|afazeres|checklist|pendencias?|operacao|operacoes)\b/],
  ['metrics', /\b(dados|indicadores?|numeros|metricas?|painel|desempenho)\b/],
  ['services', /\b(servicos?|catalogo|oferecemos|oferta)\b/],
] as const;

const descriptions = {
  daily_summary: 'resumo operacional das categorias agenda, oportunidades e tarefas para organizar o dia',
  agenda_today: 'horários, consultas ou confirmações da agenda de hoje',
  open_tasks: 'tarefas em aberto',
  open_opportunities: 'oportunidades abertas do CRM',
  clinic_metrics: 'indicadores gerais e contagens da clínica',
  service_count: 'total de serviços cadastrados',
} satisfies Record<ConsultationIntent, string>;

export function semanticRequest(message: string, available: readonly ConsultationIntent[], lastTool?: ConsultationIntent): ModelRequest | undefined {
  const normalized = normalizeMessage(message);
  // Construct the request exclusively from code-owned labels. No user token is interpolated.
  const fixedCues = cues.filter(([, matcher]) => matcher.test(normalized)).map(([label]) => label);
  if (fixedCues.length === 0 || (fixedCues.length === 1 && fixedCues[0] === 'follow_up' && !lastTool)) return;
  const previous = lastTool && available.includes(lastTool) ? lastTool : 'none';
  const menu = available.map((tool) => `${tool} = ${descriptions[tool]}`).join('\n');
  return {
    tier: 'standard',
    instructions: [
      'Classifique pedidos administrativos em português pelos sinais abstratos fornecidos. Retorne só a ferramenta.',
      'Se houver today com overview ou attention e nenhum assunto único explícito, escolha daily_summary quando existir. Siga o assunto anterior se os sinais indicarem continuação sem assunto novo.',
      'Escolha clarify quando faltar contexto para decidir ou quando o pedido indicado não estiver no menu. Não escolha uma ferramenta só por existir.',
      menu,
    ].join('\n'),
    turns: [{ role: 'user', text: `Sinais: ${fixedCues.join(', ')}. Assunto da consulta anterior: ${previous}.` }],
    tools: [],
    maxOutputTokens: 128,
    timeoutMs: 12_000,
    outputSchema: {
      type: 'object',
      properties: { tool: { type: 'string', enum: [...available, 'clarify'] } },
      required: ['tool'],
    },
  };
}

export function semanticTool(value: unknown, available: readonly ConsultationIntent[]) {
  const result = z.strictObject({ tool: z.enum([...available, 'clarify'] as const) }).safeParse(value);
  return result.success ? result.data.tool === 'clarify' ? null : result.data.tool : undefined;
}
