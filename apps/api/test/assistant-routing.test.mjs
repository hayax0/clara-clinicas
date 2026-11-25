import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeChat } from '../src/ai/assistant-routing.ts';

test('the main agent routes administrative questions in Portuguese', () => {
  assert.deepEqual(routeChat('Quantos agendamentos temos hoje?', 'main'), { intent: 'agenda_today' });
  assert.deepEqual(routeChat('Quais tarefas estão em aberto?', 'main'), { intent: 'open_tasks' });
  assert.deepEqual(routeChat('Quantas oportunidades em aberto?', 'main'), { intent: 'open_opportunities' });
  assert.deepEqual(routeChat('Quantos serviços temos?', 'operations'), { intent: 'service_count' });
  assert.deepEqual(routeChat('Como tá a clínica hoje?', 'main'), { intent: 'clinic_metrics' });
  assert.deepEqual(routeChat('E agora?', 'main', 'open_tasks'), { intent: 'open_tasks' });
});

test('specialists, advice, writes and unknown periods respect their limits', () => {
  assert.match(routeChat('Quais tarefas temos?', 'agenda').answer, /outra área/);
  assert.match(routeChat('Quero cancelar uma consulta.', 'main').answer, /alterar esse tipo de registro/);
  assert.match(routeChat('Qual o diagnóstico do paciente?', 'main').answer, /profissional responsável/);
  assert.match(routeChat('E quantas consultas amanhã?', 'agenda').answer, /outros períodos/);
  assert.match(routeChat('Olá!', 'crm').answer, /oportunidades/);
});

test('daily summary routes to the main agent before single-area keywords', () => {
  assert.deepEqual(routeChat('O que precisa da minha atenção hoje?', 'main'), { intent: 'daily_summary' });
  assert.deepEqual(routeChat('resuma o meu dia, com respostas curtas', 'main'), { intent: 'daily_summary' });
  assert.deepEqual(routeChat('Pode ser mais curto?', 'main', 'daily_summary'), { intent: 'daily_summary' });
  assert.deepEqual(routeChat('Resumo do dia: agenda, tarefas e CRM', 'main'), { intent: 'daily_summary' });
  assert.match(routeChat('Resumo do dia', 'agenda').answer, /outra área/);
  assert.match(routeChat('Resumo do dia de ontem', 'main').answer, /outros períodos/);
});
