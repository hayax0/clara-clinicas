import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.APP_TEST_URL ?? 'http://127.0.0.1:4311/api';

async function account() {
  let cookie;
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const session = response.headers.get('set-cookie');
    if (session) cookie = session.split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  const email = `assistant-flow-${randomUUID()}@example.test`;
  const registration = await request('/auth/register', 'POST', { name: 'Equipe QA', email, password: 'senha-local-sintetica' });
  assert.equal(registration.status, 201);
  return { email, request };
}

test('assistant explains, remembers within scope and creates one task only after confirmation', async () => {
  const owner = await account();
  const teammate = await account();
  const org = await owner.request('/organizations', 'POST', { name: 'Clínica de teste da conversa' });
  const other = await owner.request('/organizations', 'POST', { name: 'Outra clínica sintética' });
  assert.equal(org.status, 201);
  assert.equal(other.status, 201);
  const root = '/organizations/' + org.data.id;
  const main = root + '/assistant/chats/main';
  const operations = root + '/assistant/chats/operations';
  const send = (actor, path, message, requestId = randomUUID()) => actor.request(path, 'POST', { message, requestId });
  const step = async (actor, path, message, requestId) => {
    const result = await send(actor, path, message, requestId);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  assert.equal((await owner.request(root + '/members', 'POST', { role: 'STAFF', email: teammate.email })).status, 201);
  assert.match((await step(owner, main, 'Como agendo uma consulta?')).answer, /Novo agendamento/);
  await step(owner, main, 'Lembre que prefiro começar pela agenda.');
  assert.match((await step(owner, operations, 'O que você lembra de mim?')).answer, /prefiro começar pela agenda/);
  assert.doesNotMatch((await step(teammate, operations, 'O que você lembra de mim?')).answer, /prefiro começar/);
  const otherChat = '/organizations/' + other.data.id + '/assistant/chats/main';
  assert.doesNotMatch((await step(owner, otherChat, 'O que você lembra de mim?')).answer, /prefiro começar/);

  const proposed = await step(owner, operations, 'Crie uma tarefa: conferir a agenda de sexta');
  assert.equal(proposed.tool, 'task_proposal');
  assert.ok(proposed.proposalExpiresAt);
  assert.deepEqual((await owner.request(root + '/tasks')).data, []);
  assert.equal((await step(teammate, operations, 'Confirmar tarefa')).tool, 'task_missing');
  assert.equal((await step(owner, main, 'Confirmar tarefa')).tool, 'task_missing');

  const token = randomUUID();
  const replies = await Promise.all([
    step(owner, operations, 'Confirmar tarefa', token),
    step(owner, operations, 'Confirmar tarefa'),
  ]);
  assert.deepEqual(replies.map((reply) => reply.tool).sort(), ['task_created', 'task_missing']);
  assert.equal((await step(owner, operations, 'Confirmar tarefa', token)).id, replies[0].id);
  const tasks = (await owner.request(root + '/tasks')).data;
  assert.deepEqual(tasks.map(({ title, status }) => ({ title, status })), [{ title: 'conferir a agenda de sexta', status: 'OPEN' }]);

  await step(owner, operations, 'Crie uma tarefa: descartar este teste');
  assert.equal((await step(owner, operations, 'Cancelar a tarefa')).tool, 'task_cancelled');
  assert.equal((await owner.request(root + '/tasks')).data.length, 1);
});

test('principal delegates writes to Agenda and Operações and persists confirmed results', async () => {
  const { request } = await account();
  const org = await request('/organizations', 'POST', { name: 'Teste de agendamento' });
  const root = '/organizations/'+org.data.id;
  for (const [resource, body] of Object.entries({
    patients: { name: 'Paciente Exemplo' }, professionals: { name: 'Profissional Exemplo' },
    units: { name: 'Centro' }, services: { name: 'Consulta', durationMinutes: 30, priceCents: 0 },
  })) assert.equal((await request(root+'/'+resource, 'POST', body)).status, 201);
  const send = async message => {
    const response = await request(root+'/assistant/chats/main','POST',{ message, requestId:randomUUID() });
    assert.equal(response.status,200);
    return response.data;
  };
  const first = await send('agende um paciente hoje na agenda para as 14h');
  assert.equal(first.responderId,'agenda');
  assert.match(first.answer,/nome do paciente/);
  const proposal = await send('Paciente Exemplo amanhã às 14h');
  assert.match(proposal.answer,/14:00.*confirmar/);
  assert.equal((await request(root+'/appointments')).data.length,0);
  assert.match((await send('sim')).answer,/Agendado!/);
  assert.equal((await request(root+'/appointments')).data.length,1);
  const task = await send('Agende uma tarefa para revisar os retornos amanhã às 15h');
  assert.equal(task.responderId,'operations');
  assert.match(task.answer,/15:00/);
  await send('Confirmar tarefa');
  const [saved] = (await request(root+'/tasks')).data;
  assert.match(saved.dueAt,/T18:00:00/);
});

test('agents register within clinic and resume booking after a separate confirmation', async () => {
  const {request} = await account();
  const root = '/organizations/'+(await request('/organizations','POST',{name:'Cadastro QA'})).data.id;
  const send = async (agent,message) => {
    const result = await request(root+'/assistant/chats/'+agent,'POST',{message,requestId:randomUUID()});
    assert.equal(result.status,200);
    return result.data;
  };
  for (const [key,data] of Object.entries({units:{name:'Centro'},professionals:{name:'Profissional QA'},services:{name:'Consulta',durationMinutes:30,priceCents:0}})) await request(root+'/'+key,'POST',data);
  await send('main','Agende um paciente amanhã às 14h');
  assert.equal((await send('main','Ana Teste')).tool,'patient_proposal');
  assert.equal((await request(root+'/patients')).data.length,0);
  assert.equal((await send('main','Confirmar o cadastro')).tool,'booking_proposal');
  assert.equal((await request(root+'/appointments')).data.length,0);
  await send('main','Confirmar o agendamento');
  const [ana] = (await request(root+'/patients')).data;
  assert.equal((await request(root+'/appointments')).data[0].patientId,ana.id);
  await send('main','Marque uma consulta em 01/01/2020 às 14h');
  assert.match((await send('main','ele ainda não está cadastrado')).answer,/nome do paciente/);
  await send('main','registre a paciente Ana Maria');
  assert.match((await send('main','Confirmar o cadastro')).answer,/Cadastrei Ana Maria.*já passou/);
  assert.match((await send('main','as 14h')).answer,/qual dia/i);
  const tomorrow=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(new Date(Date.now()+86400000*2));
  const corrected=await send('main','marque as consulta para as 14 do dia '+tomorrow);
  assert.equal(corrected.tool,'booking_proposal');
  assert.ok(corrected.answer.includes(tomorrow));
  assert.match(corrected.answer,/Ana Maria.*14:00/);
  await send('main','Confirmar o agendamento');
  const registered=(await request(root+'/patients')).data.find(p=>p.name==='Ana Maria');
  assert.ok((await request(root+'/appointments')).data.some(a=>a.patientId===registered.id && a.startAt.includes('T17:00:00')));
  await send('crm','Cadastre um paciente');
  await send('crm','Lucas Teste');
  await send('crm','Cancelar o cadastro');
  assert.equal((await request(root+'/patients')).data.length,2);
  await send('operations','Cadastre a paciente Ana Teste');
  assert.match((await send('operations','sim')).answer,/Já existe/);
  await send('agenda','Cadastre a paciente Maria Teste');
  assert.match((await send('agenda','sim')).answer,/Cadastrei/);
  assert.equal((await request(root+'/patients')).data.length,3);

  // Exact user screenshot scenarios: natural booking with greeting + patient name, and confirming/cancelling appointment by patient name
  const naturalStart = await send('main','ola, quero fazer um agendamento para a paciente maria julia');
  assert.equal(naturalStart.responderId,'agenda');
  assert.equal(naturalStart.tool,'patient_proposal');
  assert.match(naturalStart.answer,/Maria Julia/);
  const afterReg = await send('main','sim');
  assert.equal(afterReg.tool,'booking_draft');
  assert.match(afterReg.answer,/Cadastrei Maria Julia/);
  const proposedSlot = await send('main','amanhã às 15h');
  assert.equal(proposedSlot.tool,'booking_proposal');
  assert.match(proposedSlot.answer,/Maria Julia.*15:00/);
  const bookedNatural = await send('main','sim');
  assert.equal(bookedNatural.tool,'booking_finished');
  assert.match(bookedNatural.answer,/Agendado!/);

  const confirmProp = await send('agenda','confirma a paciente maria julia');
  assert.equal(confirmProp.tool,'appointment_confirm_proposal');
  assert.match(confirmProp.answer,/Maria Julia.*15:00/);
  const confirmedRes = await send('agenda','sim');
  assert.equal(confirmedRes.tool,'appointment_confirmed');
  const mariaPatient = (await request(root+'/patients')).data.find(p=>p.name==='Maria Julia');
  const mariaAppt = (await request(root+'/appointments')).data.find(a=>a.patientId===mariaPatient.id);
  assert.equal(mariaAppt.status,'CONFIRMED');

  const alreadyConf = await send('agenda','confirma a paciente maria julia');
  assert.equal(alreadyConf.tool,'appointment_already_confirmed');
  assert.match(alreadyConf.answer,/já está confirmado/);

  const cancelProp = await send('agenda','cancela a consulta da maria julia');
  assert.equal(cancelProp.tool,'appointment_cancel_proposal');
  const cancelledRes = await send('agenda','sim');
  assert.equal(cancelledRes.tool,'appointment_cancelled');
  const mariaApptAfter = (await request(root+'/appointments')).data.find(a=>a.id===mariaAppt.id);
  assert.equal(mariaApptAfter.status,'CANCELLED');

  // Empty new clinic: guided setup of service, professional and unit directly inside chat booking flow
  const freshRoot = '/organizations/' + (await request('/organizations', 'POST', { name: 'Clínica Nova Chat QA' })).data.id;
  const freshSend = async (agent, message) => {
    const res = await request(freshRoot + '/assistant/chats/' + agent, 'POST', { message, requestId: randomUUID() });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data;
  };
  const s1 = await freshSend('main', 'ola, quero fazer um agendamento para a paciente maria julia');
  assert.equal(s1.tool, 'patient_proposal');
  const s2 = await freshSend('main', 'Confirmar o cadastro');
  assert.equal(s2.tool, 'setup_draft');
  assert.match(s2.answer, /Cadastrei Maria Julia.*serviço/i);
  const s3 = await freshSend('main', 'pode cadastrar');
  assert.equal(s3.tool, 'setup_draft');
  assert.match(s3.answer, /nome do serviço/i);
  const s4 = await freshSend('main', 'Consulta inicial, 30 min, 150');
  assert.equal(s4.tool, 'setup_proposal');
  assert.match(s4.answer, /Consulta inicial.*30 min.*150,00/);
  const s5 = await freshSend('main', 'sim');
  assert.equal(s5.tool, 'setup_draft');
  assert.match(s5.answer, /profissional/i);
  const s6 = await freshSend('main', 'Dra. Paula, dermatologista');
  assert.equal(s6.tool, 'setup_proposal');
  const s7 = await freshSend('main', 'sim');
  assert.equal(s7.tool, 'setup_draft');
  assert.match(s7.answer, /unidade/i);
  const s8 = await freshSend('main', 'Unidade Centro');
  assert.equal(s8.tool, 'setup_proposal');
  const s9 = await freshSend('main', 'sim');
  assert.equal(s9.tool, 'booking_draft');
  assert.match(s9.answer, /Maria Julia.*dia e horário/i);
  const s10 = await freshSend('main', 'amanhã às 16h');
  assert.equal(s10.tool, 'booking_proposal');
  const s11 = await freshSend('main', 'sim');
  assert.equal(s11.tool, 'booking_finished');
  assert.equal((await request(freshRoot + '/services')).data.length, 1);
  assert.equal((await request(freshRoot + '/professionals')).data.length, 1);
  assert.equal((await request(freshRoot + '/units')).data.length, 1);
  assert.equal((await request(freshRoot + '/appointments')).data.length, 1);

  // Standalone service registration via chat
  const st1 = await freshSend('operations', 'cadastre o serviço Retorno, 20 min, 80 reais');
  assert.equal(st1.tool, 'setup_proposal');
  assert.match(st1.answer, /Retorno.*20 min.*80,00/);
  const st2 = await freshSend('operations', 'sim');
  assert.equal(st2.tool, 'setup_finished');
  assert.equal((await request(freshRoot + '/services')).data.length, 2);
});
