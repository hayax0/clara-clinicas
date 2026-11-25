import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const connectionString = process.env.TEST_AI_USAGE_DATABASE_URL;

test('private notes and approved tasks are scoped, atomic and retry-safe', { skip: !connectionString }, async (t) => {
  const [{ PrismaPg }, { PrismaClient }, { finishAssistantAction }] = await Promise.all([
    import('@prisma/adapter-pg'),
    import('../dist/generated/prisma/client.js'),
    import('../dist/ai/assistant-actions.js'),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [organizationId, otherOrganizationId, actorId, otherActorId] = Array.from({ length: 4 }, () => randomUUID());
  const clinicIds = [organizationId, otherOrganizationId];
  const actorIds = [actorId, otherActorId];
  t.after(async () => {
    try {
      await db.auditEvent.deleteMany({ where: { organizationId: { in: clinicIds } } });
      await db.task.deleteMany({ where: { organizationId: { in: clinicIds } } });
      await db.organization.deleteMany({ where: { id: { in: clinicIds } } });
      await db.user.deleteMany({ where: { id: { in: actorIds } } });
    } finally {
      await db.$disconnect();
    }
  });
  await db.organization.createMany({
    data: clinicIds.map((id) => ({ id, name: 'Clínica sintética para ações do assistente' })),
  });
  await db.user.createMany({
    data: actorIds.map((id) => ({ id, name: 'Usuário sintético', email: id + '@example.test', passwordHash: 'fixture' })),
  });
  await db.membership.createMany({
    data: [
      { organizationId, userId: actorId, role: 'STAFF' },
      { organizationId, userId: otherActorId, role: 'MANAGER' },
      { organizationId: otherOrganizationId, userId: actorId, role: 'OWNER' },
    ],
  });

  const scope = { organizationId, actorId, agentId: 'main' };
  const makeTurn = (chat = scope) => db.assistantTurn.create({
    data: { ...chat, requestId: randomUUID(), userText: 'Interação sintética' }, select: { id: true },
  });
  const interact = async (command, chat = scope) => finishAssistantAction(db, chat, (await makeTurn(chat)).id, command);
  const note = 'Prefiro revisar o painel cedo';
  assert.equal((await interact({ kind: 'remember', note })).tool, 'note_remember');
  assert.equal((await interact({ kind: 'remember', note })).tool, 'note_remember');
  assert.equal(await db.assistantNote.count({ where: { organizationId, actorId } }), 1);
  assert.match((await interact({ kind: 'recall' }, { ...scope, agentId: 'agenda' })).answer, /revisar o painel cedo/);
  assert.doesNotMatch((await interact({ kind: 'recall' }, { ...scope, actorId: otherActorId })).answer, /revisar o painel cedo/);
  assert.doesNotMatch((await interact({ kind: 'recall' }, { ...scope, organizationId: otherOrganizationId })).answer, /revisar o painel cedo/);

  const title = 'Revisar estoque da recepção';
  const proposal = await interact({ kind: 'propose_task', title });
  assert.equal(proposal.tool, 'task_proposal');
  assert.ok(proposal.proposalExpiresAt > new Date());
  assert.equal(await db.task.count({ where: { organizationId } }), 0);
  assert.equal((await interact({ kind: 'propose_task', title: 'Outra tarefa' })).tool, 'task_waiting');
  assert.equal((await interact({ kind: 'confirm_task' }, { ...scope, agentId: 'operations' })).tool, 'task_missing');
  assert.equal((await interact({ kind: 'confirm_task' }, { ...scope, actorId: otherActorId })).tool, 'task_missing');

  const [{ id: first }, { id: second }] = await Promise.all([makeTurn(), makeTurn()]);
  const outcomes = await Promise.all([
    finishAssistantAction(db, scope, first, { kind: 'confirm_task' }),
    finishAssistantAction(db, scope, second, { kind: 'confirm_task' }),
  ]);
  assert.deepEqual(outcomes.map(({ tool }) => tool).sort(), ['task_created', 'task_missing']);
  const created = outcomes.find(({ tool }) => tool === 'task_created');
  assert.equal((await finishAssistantAction(db, scope, created.id, { kind: 'confirm_task' })).answer, created.answer);
  const tasks = await db.task.findMany({ where: { organizationId } });
  assert.deepEqual(tasks.map(({ title, status }) => ({ title, status })), [{ title, status: 'OPEN' }]);
  assert.equal(await db.auditEvent.count({ where: { organizationId, action: 'assistant.task.created', resourceId: tasks[0].id } }), 1);
  assert.equal((await db.assistantTurn.findUniqueOrThrow({ where: { id: proposal.id } })).proposalExpiresAt, null);

  const expiring = await interact({ kind: 'propose_task', title: 'Proposta expirada' });
  await db.assistantTurn.update({ where: { id: expiring.id }, data: { proposalExpiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await interact({ kind: 'confirm_task' })).tool, 'task_missing');
  assert.equal((await interact({ kind: 'propose_task', title: 'Proposta descartada' })).tool, 'task_proposal');
  assert.equal((await interact({ kind: 'cancel_task' })).tool, 'task_cancelled');
  assert.equal((await interact({ kind: 'confirm_task' })).tool, 'task_missing');
  assert.equal(await db.task.count({ where: { organizationId } }), 1);

  await db.membership.update({ where: { organizationId_userId: { organizationId, userId: actorId } }, data: { role: 'VIEWER' } });
  await assert.rejects(interact({ kind: 'remember', note: 'Sem permissão' }), { status: 403 });
});
