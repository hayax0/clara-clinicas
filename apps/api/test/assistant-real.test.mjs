import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.APP_TEST_URL ?? 'http://127.0.0.1:4311/api';

function client() {
  let cookie;
  return async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, data: await response.json() };
  };
}

async function register(use) {
  const result = await use('/auth/register', 'POST', {
    name: 'Operador sintético IA',
    email: `gemini-${randomUUID()}@example.test`,
    password: 'senha-sintetica-ia',
  });
  assert.equal(result.status, 201);
  return result.data.user.email;
}

test('real Gemini delegates read-only consultations with synthetic clinic records', {
  skip: process.env.CLARA_REAL_GEMINI_TEST !== '1',
}, async () => {
  const owner = client();
  const outsider = client();
  const viewer = client();
  await register(owner);
  const outsiderEmail = await register(outsider);
  const viewerEmail = await register(viewer);
  const clinic = await owner('/organizations', 'POST', { name: 'Clínica sintética IA', timezone: 'UTC' });
  assert.equal(clinic.status, 201);
  const root = '/organizations/' + clinic.data.id;
  const endpoint = root + '/assistant';
  assert.equal((await owner(root + '/tasks', 'POST', { title: 'Pendência sintética' })).status, 201);
  assert.equal((await owner(root + '/services', 'POST', { name: 'Serviço sintético', durationMinutes: 30, priceCents: 0 })).status, 201);
  assert.equal((await owner(root + '/members', 'POST', { email: viewerEmail, role: 'VIEWER' })).status, 201);

  assert.equal((await client()(endpoint)).status, 401);
  assert.equal((await outsider(endpoint)).status, 404);
  assert.equal((await outsider(endpoint, 'POST', { intent: 'open_tasks' })).status, 404);
  assert.equal((await viewer(endpoint)).data.available, false);
  assert.equal((await viewer(endpoint, 'POST', { intent: 'open_tasks' })).status, 403);
  assert.equal((await owner(endpoint, 'POST', { intent: 'open_tasks', patient: 'Pessoa fictícia' })).status, 400);
  assert.deepEqual((await owner(endpoint)).data.executions, []);

  const checks = [
    ['agenda_today', 'agenda', 0],
    ['open_tasks', 'operations', 1],
    ['open_opportunities', 'crm', 0],
    ['clinic_metrics', 'main', 0],
    ['service_count', 'operations', 1],
  ];
  for (const [intent, agent, count] of checks) {
    const result = await owner(endpoint, 'POST', { intent });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.agentId, agent);
    assert.equal(result.data.tool, intent);
    assert.equal(result.data.metrics[0].value, count);
  }

  const { available, executions } = (await owner(endpoint)).data;
  assert.equal(available, true);
  assert.equal(executions.length, checks.length);
  assert.ok(executions.every((execution) => execution.status === 'COMPLETED'));
  assert.deepEqual((await viewer(endpoint)).data.executions, []);

  const mainChat = endpoint + '/chats/main';
  const operationsChat = endpoint + '/chats/operations';
  assert.equal((await outsider(mainChat)).status, 404);
  assert.equal((await viewer(mainChat, 'POST', { message: 'Oi', requestId: randomUUID() })).status, 403);
  const message = { message: 'Quais tarefas estão em aberto?', requestId: randomUUID() };
  const chat = await owner(mainChat, 'POST', message);
  assert.equal(chat.status, 200, JSON.stringify(chat.data));
  assert.equal(chat.data.responderId, 'operations');
  assert.deepEqual(chat.data.metrics, [{ label: 'Tarefas abertas', value: 1 }]);
  const repeat = await owner(mainChat, 'POST', message);
  assert.equal(repeat.data.id, chat.data.id);
  assert.equal((await owner(mainChat, 'POST', { ...message, message: 'Outra pergunta' })).status, 409);

  const help = await owner(operationsChat, 'POST', { message: 'Como está a agenda?', requestId: randomUUID() });
  assert.equal(help.status, 200);
  assert.match(help.data.answer, /outra área/);
  assert.deepEqual(help.data.metrics, []);
  assert.equal((await owner(mainChat)).data.messages.length, 1);
  assert.equal((await owner(operationsChat)).data.messages.length, 1);
  assert.deepEqual((await viewer(mainChat)).data.messages, []);
  assert.equal((await owner(root + '/members', 'POST', { email: outsiderEmail, role: 'STAFF' })).status, 201);
  assert.deepEqual((await outsider(mainChat)).data.messages, []);
  async function create(resource, body) {
    const result = await owner(root + '/' + resource, 'POST', body);
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.id;
  }
  const unitId = await create('units', { name: 'Unidade sintética' });
  const professionalId = await create('professionals', { name: 'Profissional sintético' });
  const patientId = await create('patients', { name: 'Paciente que não aparece no resumo' });
  const serviceId = await create('services', { name: 'Serviço do resumo', durationMinutes: 30, priceCents: 0 });
  const date = new Date().toISOString().slice(0, 10);
  await create('appointments', { patientId, professionalId, unitId, serviceId, startAt: date + 'T13:40:00.000Z', endAt: date + 'T14:10:00.000Z' });
  await create('appointments', { patientId, professionalId, unitId, serviceId, status: 'CONFIRMED', startAt: date + 'T15:00:00.000Z', endAt: date + 'T15:30:00.000Z' });
  const contactId = await create('contacts', { name: 'Contato sintético' });
  await create('opportunities', { title: 'Retorno comercial', contactId });
  await create('opportunities', { title: 'Oportunidade encerrada', contactId, stage: 'WON' });
  await create('tasks', { title: 'Tarefa concluída', status: 'DONE' });

  const summary = await owner(mainChat, 'POST', { message: 'O que precisa da minha atenção hoje?', requestId: randomUUID() });
  assert.equal(summary.status, 200, JSON.stringify(summary.data));
  assert.equal(summary.data.responderId, 'main');
  assert.deepEqual(summary.data.metrics, [
    { label: 'Agendamentos a confirmar hoje', value: 1 },
    { label: 'Oportunidades em aberto', value: 1 },
    { label: 'Tarefas pendentes', value: 1 },
  ]);
  assert.match(summary.data.answer, /13:40/);
  assert.match(summary.data.answer, /Retorno comercial/);
  assert.match(summary.data.answer, /Pendência sintética/);
  assert.doesNotMatch(summary.data.answer, /Paciente|15:00|encerrada|concluída/);
  const recent = (await owner(mainChat)).data.messages.at(-1);
  assert.equal(recent.id, summary.data.id);

  const preference = await owner(operationsChat, 'POST', { message: 'Lembre que prefiro respostas curtas.', requestId: randomUUID() });
  assert.equal(preference.status, 200);
  const brief = await owner(mainChat, 'POST', { message: 'Resumo de hoje', requestId: randomUUID() });
  assert.equal(brief.status, 200, JSON.stringify(brief.data));
  assert.equal(brief.data.answer, 'Hoje você tem 1 horário a confirmar, 1 oportunidade em aberto e 1 tarefa pendente.');
  assert.deepEqual(brief.data.metrics, summary.data.metrics);

  const screenshot = await owner(mainChat, 'POST', { message: 'resuma o meu dia, com respostas curtas', requestId: randomUUID() });
  assert.equal(screenshot.status, 200, JSON.stringify(screenshot.data));
  assert.equal(screenshot.data.tool, 'daily_summary');
  assert.equal(screenshot.data.answer, brief.data.answer);
  const paraphrase = await owner(mainChat, 'POST', { message: 'O que falta resolver agora?', requestId: randomUUID() });
  assert.equal(paraphrase.status, 200, JSON.stringify(paraphrase.data));
  assert.equal(paraphrase.data.tool, 'daily_summary');
  assert.deepEqual(paraphrase.data.metrics, summary.data.metrics);
  const expanded = await owner(mainChat, 'POST', { message: 'Resuma o meu dia com detalhes', requestId: randomUUID() });
  assert.equal(expanded.status, 200);
  assert.match(expanded.data.answer, /Retorno comercial/);

});
