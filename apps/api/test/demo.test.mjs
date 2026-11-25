import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = process.env.APP_TEST_URL ?? 'http://127.0.0.1:4311/api';

test('local demo enters only the synthetic clinic with ordinary staff permissions', {
  skip: process.env.CLARA_TEST_DEMO !== '1',
}, async () => {
  const status = await fetch(base + '/auth/demo');
  assert.deepEqual(await status.json(), { available: true });
  const login = await fetch(base + '/auth/demo', { method: 'POST' });
  assert.equal(login.status, 204);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'content-type': 'application/json' };
  const session = await (await fetch(base + '/session', { headers })).json();
  assert.equal(session.user.isDemo, true);
  assert.equal(session.user.isAdmin, false);
  assert.equal(session.memberships.length, 1);
  assert.equal(session.memberships[0].role, 'STAFF');
  const demo = session.memberships[0].organization.id;
  assert.equal((await fetch(base + '/organizations/' + demo + '/dashboard', { headers })).status, 200);
  assert.equal((await fetch(base + '/organizations/47fe607b-4ae6-4f65-a863-53dd4166b861/dashboard', { headers })).status, 404);
  assert.equal((await fetch(base + '/admin/organizations', { headers })).status, 403);
  assert.equal((await fetch(base + '/organizations', { method: 'POST', headers, body: JSON.stringify({ name: 'Outra clínica' }) })).status, 403);
  assert.equal((await fetch(base + '/auth/demo', { method: 'POST', headers: { origin: 'https://example.test' } })).status, 403);
});
