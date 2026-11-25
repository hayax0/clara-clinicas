import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefForTurn, semanticRequest, semanticTool } from '../src/ai/assistant-language.ts';
import { buildBrainRequest, sanitizeForModel } from '../src/ai/assistant-brain.ts';

test('per-message brevity or detail overrides default presentation', () => {
  assert.equal(briefForTurn('resuma o meu dia, com respostas curtas'), true);
  assert.equal(briefForTurn('Fala sem enrolação'), true);
  assert.equal(briefForTurn('Quero o resumo com detalhes'), false);
  assert.equal(briefForTurn('Qual o resumo do dia?'), undefined);
});

test('semantic interpretation transmits only fixed cues and authorized tool choices', () => {
  const permitted = ['daily_summary', 'agenda_today'];
  const request = semanticRequest('Aurora Exemplo, 123.456.789-00, o que falta resolver agora?', permitted, 'open_tasks');
  assert.ok(request);
  const outbound = JSON.stringify(request);
  assert.doesNotMatch(outbound, /Aurora|Exemplo|123\.456|falta resolver|open_tasks/);
  assert.match(outbound, /today, attention/);
  assert.equal(semanticTool({ tool: 'daily_summary' }, permitted), 'daily_summary');
  assert.equal(semanticTool({ tool: 'clarify' }, permitted), null);
  assert.equal(semanticTool({ tool: 'open_tasks' }, permitted), undefined);
  assert.equal(semanticTool({ tool: 'daily_summary', clinic: 'injected' }, permitted), undefined);
  assert.equal(semanticRequest('Conte uma piada', permitted), undefined);
});

test('conversational brain sanitizes sensitive tokens and keeps agent tool boundaries', () => {
  const sanitized = sanitizeForModel('CPF 123.456.789-00 email ana@clinica.test telefone (11) 99999-8888');
  assert.doesNotMatch(sanitized, /123\.456|ana@clinica|99999-8888/);
  const agendaReq = buildBrainRequest({
    agentId: 'agenda',
    clinicName: 'Clínica QA',
    history: [{ userText: 'oi', answer: 'Olá!' }],
    notes: [],
    message: 'a maria julia avisou que vem',
    preferBrief: false,
  });
  assert.deepEqual(agendaReq.outputSchema.properties.tool.enum, ['agenda_today', 'agenda_schedule', 'patient_overview']);
});
