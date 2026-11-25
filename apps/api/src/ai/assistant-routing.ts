import type { ConsultationIntent } from './assistant-plan.js';

export const chatAgentIds = ['main', 'agenda', 'crm', 'operations'] as const;
export type ChatAgentId = (typeof chatAgentIds)[number];

const profiles = {
  main: { title: 'Agente Principal', tools: ['daily_summary', 'agenda_today', 'open_tasks', 'open_opportunities', 'clinic_metrics', 'service_count'] },
  agenda: { title: 'Agenda', tools: ['agenda_today'] },
  crm: { title: 'CRM', tools: ['open_opportunities'] },
  operations: { title: 'Operações', tools: ['open_tasks', 'service_count'] },
} satisfies Record<ChatAgentId, { title: string; tools: ConsultationIntent[] }>;

const exampleQuestions: Record<ConsultationIntent, string> = {
  daily_summary: 'O que precisa da minha atenção hoje?',
  agenda_today: 'Quantos agendamentos temos hoje?',
  open_tasks: 'Quais tarefas estão em aberto?',
  open_opportunities: 'Quantas oportunidades estão em aberto?',
  clinic_metrics: 'Como estão os indicadores da clínica?',
  service_count: 'Quantos serviços temos cadastrados?',
};

const toolMatchers: [ConsultationIntent, RegExp][] = [
  ['agenda_today', /\b(agenda|agendamentos?|consultas?|horarios?|atendimentos? (de )?hoje|confirmacoes?|confirmar)\b/],
  ['open_tasks', /\b(tarefas?|pendencias?|afazeres)\b/],
  ['open_opportunities', /\b(crm|oportunidades?|leads?|funil|retornos? comerciais?)\b/],
  ['clinic_metrics', /\b(indicadores?|painel|metricas?|resumo|visao geral|balanco|como (esta|ta|vai) (a|minha) clinica)\b/],
  ['service_count', /\b(servicos?|catalogo)\b/],
];

export function permittedConsultations(agent: ChatAgentId): readonly ConsultationIntent[] {
  return profiles[agent].tools;
}

export function routeChat(message: string, agent: ChatAgentId, lastTool?: ConsultationIntent) {
  const clean = message.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const profile: { title: string; tools: ConsultationIntent[] } = profiles[agent];
  if (/\b(diagnosti\w*|prescrev\w*|receit\w*|medicamento\w*|sintoma\w*|tratamento\w*)\b/.test(clean)) {
    return { answer: 'Posso ajudar com a rotina administrativa da clínica. Para uma questão clínica, fale com o profissional responsável.' };
  }
  if (/\b(cancele|cancelar|marque|marcar|delete|exclu\w*|remova|remover|envie|enviar|cadastre|cadastrar|altere|alterar|reagend\w*)\b/.test(clean)) {
    return { answer: 'Para alterar esse tipo de registro, use a área correspondente no menu da clínica.' };
  }

  const matches = toolMatchers.filter(([, matcher]) => matcher.test(clean)).map(([tool]) => tool);
  const laterPeriod = /\b(amanha|ontem|semana|mes|ano|proximos? dias)\b/.test(clean);
  const followUp = /^(e )?(hoje|agora|atualize|atualiza|atualizar|de novo|e ai|ainda (ha|tem) algum[as]?)\b[?!. ]*$/.test(clean)
    || /^pode (me )?(atualizar|conferir de novo)[?!. ]*$/.test(clean)
    || /^(?:(?:quero|faz|faca|pode ser) )?(?:mais curt[oa]|mais breve|mais detalhad[oa]|em poucas palavras|com detalhes|sem detalhes|so os numeros)[?!. ]*$/.test(clean);
  const wantsDailySummary = /\b(resumo (do|de|para o) dia|resumo de hoje|pendencias do dia|resum[aeio]r? (o |a )?(meu |nosso )?dia|panorama (rapido )?(do |de )?(meu |nosso )?(dia|hoje)|o que (precisa|merece|requer) (da minha |de |de minha )?atencao( hoje)?)\b/.test(clean);
  const intent = (wantsDailySummary ? 'daily_summary' : matches[0]) ?? (followUp ? (lastTool ?? (profile.tools.length === 1 ? profile.tools[0] : undefined)) : undefined);

  if (laterPeriod) {
    return { answer: 'Hoje posso consultar os totais atuais. Para outros períodos, abra a área correspondente no menu da clínica.' };
  }
  if (intent && !profile.tools.includes(intent)) {
    return { answer: 'Essa consulta é de outra área. Abra o Agente Principal para seguir com ela.' };
  }
  if (!wantsDailySummary && matches.length > 1) {
    return { interpret: true, answer: 'Quer que eu junte isso no resumo do dia ou confira uma dessas áreas primeiro?' };
  }
  if (intent) return { intent };

  const greeting = /^(ola|oi|bom dia|boa tarde|boa noite)[ !?.]*$/.test(clean);
  const suggestion = exampleQuestions[profile.tools[0]];
  return {
    answer: greeting
      ? `Olá! Sou ${profile.title === 'Agente Principal' ? 'o Agente Principal' : profile.title}, um ajudante da Clara. Experimente perguntar: “${suggestion}”`
      : lastTool
        ? "Você quer que eu atualize o último resultado ou veja outra coisa da clínica?"
        : "O que você quer conferir? Posso começar pelo que está pendente ou olhar uma área específica com você.",
    interpret: !greeting,
  };
}
