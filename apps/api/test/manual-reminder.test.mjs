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

test('manual reminder stays pending until clinic records sending', async()=>{
 const {request}=await account();
 const root='/organizations/'+(await request('/organizations','POST',{name:'Fila QA'})).data.id;
 const body={};
 for(const [key,path,extra] of [['patient','patients',{}],['unit','units',{}],['professional','professionals',{}],['service','services',{durationMinutes:30,priceCents:0}]]) {
   body[key+'Id']=(await request(root+'/'+path,'POST',{name:'Registro QA',...extra})).data.id;
 }
 const startAt=new Date(Date.now()+3600000).toISOString();
 const a=(await request(root+'/appointments','POST',{...body,startAt,endAt:new Date(Date.now()+5400000).toISOString(),reminderPhone:'5511999999999'})).data;
 const path=root+'/reminders/'+a.id;
 assert.equal((await request(root+'/reminders/queue')).data.length,1);
 if(process.env.CLARA_REAL_GEMINI_TEST==='1'){
   const draft=await request(path+'/draft','POST',{});
   assert.equal(draft.data.source,'Gemini');
   assert.equal(draft.data.startAt,startAt);
   assert.equal((await request(root+'/reminders/queue')).data.length,1);
 }
 await request(path+'/sent','POST',{startAt,phone:a.reminderPhone,patientId:a.patientId});
 assert.equal((await request(root+'/reminders/queue')).data.length,0);
 assert.equal((await request('/channels/whatsapp')).status,404);
});
