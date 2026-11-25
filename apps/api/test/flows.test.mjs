import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.APP_TEST_URL ?? 'http://127.0.0.1:4311/api';
const suffix = randomUUID();
const password = 'cafe-com-leite-4310';

function client() {
  let cookie;
  return async (path, method = 'GET', data, expected = 200, headers = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie && { cookie }),
        ...(data && { 'content-type': 'application/json' }),
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    const nextCookie = response.headers.get('set-cookie');
    if (nextCookie) cookie = nextCookie.split(';')[0];
    const payload = response.status === 204 ? undefined : await response.json();
    assert.equal(response.status, expected, `${method} ${path} => ${JSON.stringify(payload)}`);
    return payload;
  };
}

test('clinic setup, scheduling, CRM, roles and isolation', async () => {
  const owner = client();
  const viewer = client();
  const outsider = client();
  const ownerEmail = `owner-${suffix}@example.test`;
  const viewerEmail = `viewer-${suffix}@example.test`;
  await owner('/health');
  await owner('/session', 'GET', undefined, 401);
  await owner('/auth/register', 'POST', { name: 'Gestora QA', email: ownerEmail, password }, 201);
  await viewer('/auth/register', 'POST', { name: 'Observadora QA', email: viewerEmail, password }, 201);
  await outsider('/auth/register', 'POST', { name: 'Outra gestora QA', email: `outsider-${suffix}@example.test`, password }, 201);
  await client()('/auth/login', 'POST', { email: ownerEmail, password: 'senha-errada-qa' }, 401);
  const login = await client()('/auth/login', 'POST', { email: ownerEmail.toUpperCase(), password });
  assert.equal(login.user.email, ownerEmail);
  const clinic = await owner('/organizations', 'POST', { name: 'Clínica QA', timezone: 'America/Sao_Paulo' }, 201);
  const otherClinic = await outsider('/organizations', 'POST', { name: 'Outra clínica QA' }, 201);
  const root = `/organizations/${clinic.id}`;
  const otherRoot = `/organizations/${otherClinic.id}`;

  assert.equal((await owner('/session')).memberships[0].role, 'OWNER');
  await outsider(root, 'GET', undefined, 404);
  await owner('/admin/organizations', 'GET', undefined, 403);
  await owner(root, 'PATCH', { name: 'Clínica revisada' }, 403, { origin: 'https://example.test' });
  assert.equal((await owner(root, 'PATCH', { name: 'Clínica revisada' })).name, 'Clínica revisada');
  const member = await owner(root + '/members', 'POST', { email: viewerEmail, role: 'VIEWER' }, 201);
  await viewer(root + '/tasks', 'POST', { title: 'Tentativa sem permissão' }, 403);
  await viewer(root, 'PATCH', { name: 'Tentativa sem permissão' }, 403);
  assert.deepEqual(await viewer(root + '/tasks'), []);

  const unit = await owner(root + '/units', 'POST', { name: 'Centro' }, 201);
  const professional = await owner(root + '/professionals', 'POST', { name: 'Dra. Laura' }, 201);
  const service = await owner(root + '/services', 'POST', {
    name: 'Consulta', durationMinutes: 30, priceCents: 150_00,
  }, 201);
  const patient = await owner(root + '/patients', 'POST', { name: 'Paciente QA', phone: '11999999999' }, 201);
  const foreignPatient = await outsider(otherRoot + '/patients', 'POST', { name: 'Paciente externo QA' }, 201);
  assert.equal((await viewer(root + '/patients')).length, 1);
  assert.deepEqual(await outsider(otherRoot + '/units'), []);
  await outsider(otherRoot + '/patients/' + patient.id, 'PATCH', { name: 'Acesso externo' }, 404);
  await owner(root + '/patients', 'POST', { name: 'Registro inválido', organizationId: otherClinic.id }, 400);

  const contact = await owner(root + '/contacts', 'POST', { name: 'Contato QA', email: 'contato@example.test' }, 201);
  const opportunity = await owner(root + '/opportunities', 'POST', { contactId: contact.id, title: 'Avaliação' }, 201);
  const stageChange = await owner(root + '/opportunities/' + opportunity.id, 'PATCH', { stage: 'CONTACTED' });
  assert.equal(stageChange.stage, 'CONTACTED');
  assert.equal(stageChange.contactId, contact.id);
  const task = await owner(root + '/tasks', 'POST', { title: 'Confirmar entrega' }, 201);
  assert.equal(task.dueAt, null);
  await owner(root + '/tasks/' + task.id, 'PATCH', { status: 'DONE' });

  const appointment = {
    patientId: patient.id, professionalId: professional.id, serviceId: service.id, unitId: unit.id,
    startAt: '2036-06-01T13:00:00.000Z', endAt: '2036-06-01T13:30:00.000Z',
  };
  await owner(root + '/appointments', 'POST', { ...appointment, patientId: foreignPatient.id }, 400);
  await owner(root + '/appointments', 'POST', { ...appointment, endAt: appointment.startAt }, 400);
  const postAppointment = () => fetch(base + root + '/appointments', {
    method: 'POST',
    headers: { cookie: bookingSession, 'content-type': 'application/json' },
    body: JSON.stringify(appointment),
  });
  const response = await fetch(base + '/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password }),
  });
  const bookingSession = response.headers.get('set-cookie').split(';')[0];
  const bookings = await Promise.all([postAppointment(), postAppointment()]);
  assert.deepEqual(bookings.map((item) => item.status).sort(), [201, 409]);
  const booked = await bookings.find((item) => item.status === 201).json();
  assert.equal(booked.status, 'SCHEDULED');
  await owner(root + '/appointments/' + booked.id, 'PATCH', { status: 'CANCELLED' });
  await owner(root + '/appointments', 'POST', appointment, 201);
  await owner(root + '/patients/' + patient.id, 'DELETE', undefined, 409);

  const dashboard = await viewer(root + '/dashboard');
  assert.deepEqual(dashboard, { appointments: 0, patients: 1, contacts: 1, opportunities: 1, tasks: 0 });
  await owner(root + '/members/' + member.id, 'DELETE', undefined, 204);
  await viewer(root, 'GET', undefined, 404);
  await owner('/auth/logout', 'POST', undefined, 204);
  await owner('/session', 'GET', undefined, 401);
});
