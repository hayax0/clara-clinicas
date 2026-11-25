import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretConversation } from '../src/ai/assistant-conversation.ts';

test('welcomes the team and offers help tied to the agent', () => {
  assert.match(interpretConversation('Bom dia!', 'agenda')?.answer, /horários/);
  assert.match(interpretConversation('Valeu pela ajuda!', 'main')?.answer, /De nada/);
  assert.match(interpretConversation('Como você pode me ajudar?', 'operations')?.answer, /registrar uma tarefa/);
  assert.equal(interpretConversation('E agora?', 'main'), undefined);
});

test('answers platform questions and leaves live data requests to the router', () => {
  assert.match(interpretConversation('Como faço para cadastrar um paciente?', 'agenda')?.answer, /Novo paciente/);
  assert.match(interpretConversation('Como confirmo um agendamento?', 'main')?.answer, /Confirmada/);
  assert.match(interpretConversation('Onde adiciono um serviço?', 'operations')?.answer, /Novo serviço/);
  assert.match(interpretConversation('Como concluo uma tarefa?', 'operations')?.answer, /Concluída/);
  assert.match(interpretConversation('Como faço para cancelar um agendamento?', 'main')?.answer, /Cancelada/);
  assert.match(interpretConversation('Como eu faço para cadastrar um profissional para agendamentos?', 'main')?.answer, /Novo profissional/);
  assert.equal(interpretConversation('Quantos agendamentos temos hoje?', 'main'), undefined);
  assert.equal(interpretConversation('Como está a agenda hoje?', 'main'), undefined);
  assert.equal(interpretConversation('Como trato esses sintomas?', 'agenda'), undefined);
});

test('remembers explicit administrative preferences and keeps original accents and capitalization', () => {
  assert.deepEqual(interpretConversation('Lembre que prefiro revisar a Agenda às 8h.', 'main'), {
    kind: 'remember',
    note: 'prefiro revisar a Agenda às 8h.',
  });
  assert.deepEqual(interpretConversation('O que você lembra de mim?', 'crm'), { kind: 'recall' });
  assert.equal(interpretConversation('Prefiro revisar a Agenda às 8h.', 'main'), undefined);
  for (const request of ['Guarde que o CPF é 123.456.789-00', 'Anote que paciente Maria está com febre', 'Lembre que uso joana@example.com']) {
    assert.equal(interpretConversation(request, 'main')?.kind, 'answer');
  }
});

test('stages explicit task requests and requires equally explicit resolution', () => {
  for (const request of ['Crie uma tarefa: Conferir os horários da recepção', 'Pode criar uma tarefa para Conferir os horários da recepção', 'Registre nova tarefa — Conferir os horários da recepção']) {
    assert.deepEqual(interpretConversation(request, 'operations'), {
      kind: 'propose_task',
      title: 'Conferir os horários da recepção',
    });
  }
  assert.deepEqual(interpretConversation('Sim, pode criar!', 'operations'), { kind: 'confirm_task' });
  assert.deepEqual(interpretConversation('Confirmar tarefa', 'operations'), { kind: 'confirm_task' });
  assert.deepEqual(interpretConversation('Cancelar a tarefa', 'operations'), { kind: 'cancel_task' });
  assert.equal(interpretConversation('sim', 'operations'), undefined);
  assert.equal(interpretConversation('Preciso de uma tarefa?', 'operations'), undefined);
  assert.equal(interpretConversation('Como crio uma tarefa para a recepção?', 'operations')?.kind, 'answer');
});
