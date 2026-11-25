import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const connectionString = process.env.TEST_AI_USAGE_DATABASE_URL;

test('concurrent reservations, reconciliation and history isolation in PostgreSQL', { skip: !connectionString }, async (t) => {
  const [{ PrismaPg }, { PrismaClient }, { AiUsage }] = await Promise.all([
    import('@prisma/adapter-pg'),
    import('../dist/generated/prisma/client.js'),
    import('../dist/ai/usage.js'),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const previousTokenLimit = process.env.GEMINI_DAILY_TOKEN_LIMIT;
  const previousCallLimit = process.env.GEMINI_DAILY_CALL_LIMIT;
  process.env.GEMINI_DAILY_TOKEN_LIMIT = '6100';
  process.env.GEMINI_DAILY_CALL_LIMIT = '6';
  t.after(() => {
    if (previousTokenLimit === undefined) delete process.env.GEMINI_DAILY_TOKEN_LIMIT;
    else process.env.GEMINI_DAILY_TOKEN_LIMIT = previousTokenLimit;
    if (previousCallLimit === undefined) delete process.env.GEMINI_DAILY_CALL_LIMIT;
    else process.env.GEMINI_DAILY_CALL_LIMIT = previousCallLimit;
  });

  const ids = [randomUUID(), randomUUID()];
  await db.organization.createMany({ data: ids.map((id) => ({ id, name: 'Clínica sintética para testar cotas' })) });
  t.after(async () => {
    try {
      await db.organization.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  });

  const usage = new AiUsage(db);
  const [organizationId, otherOrganization] = ids;
  const actorId = randomUUID();
  const reservation = { organizationId, actorId, agentId: 'synthetic', estimatedTokens: 3_072, estimatedCalls: 3 };
  const pending = await Promise.allSettled(Array.from({ length: 12 }, () => usage.reserve(reservation)));
  const granted = pending.filter((attempt) => attempt.status === 'fulfilled');
  assert.equal(granted.length, 1);
  for (const rejected of pending.filter((attempt) => attempt.status === 'rejected')) {
    assert.equal(rejected.reason.getStatus(), 429);
  }

  const { id } = granted[0].value;
  const providerUsage = {
    modelId: 'gemini-3.5-flash-lite',
    latencyMs: 42,
    attempts: 1,
    inputTokens: 40,
    cachedInputTokens: 10,
    outputTokens: 20,
    thinkingTokens: 5,
  };
  await usage.finish(id, { status: 'COMPLETED', tool: 'agenda_today', usage: providerUsage });
  await usage.finish(id, { status: 'FAILED' });
  const completed = await db.aiExecution.findUniqueOrThrow({ where: { id } });
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.accountedTokens, 65);
  assert.equal(completed.accountedCalls, 1);
  assert.equal(completed.estimatedCostUsd.toNumber(), 0.0000718);

  const { id: failedId } = await usage.reserve(reservation);
  await usage.finish(failedId, { status: 'FAILED' });
  const failed = await db.aiExecution.findUniqueOrThrow({ where: { id: failedId } });
  assert.equal(failed.accountedCalls, 3);
  assert.equal(failed.accountedTokens, 3_072);
  assert.equal(failed.estimatedCostUsd, null);
  await assert.rejects(usage.reserve(reservation), (error) => error.getStatus() === 429);

  const { id: otherId } = await usage.reserve({ ...reservation, organizationId: otherOrganization });
  await usage.finish(otherId, { status: 'BLOCKED', usage: { ...providerUsage, attempts: 2 } });
  const retried = await db.aiExecution.findUniqueOrThrow({ where: { id: otherId } });
  assert.equal(retried.accountedCalls, 2);
  assert.equal(retried.accountedTokens, 3_072);
  assert.equal(retried.estimatedCostUsd, null);

  const history = await usage.history(organizationId, actorId);
  assert.deepEqual(new Set(history.map((item) => item.id)), new Set([id, failedId]));
  assert.deepEqual(Object.keys(history[0]).sort(), ['agentId', 'createdAt', 'id', 'status', 'tool']);
  assert.deepEqual(await usage.history(organizationId, randomUUID()), []);
  assert.deepEqual((await usage.history(otherOrganization, actorId)).map((item) => item.id), [otherId]);
});
