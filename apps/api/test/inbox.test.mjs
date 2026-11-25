import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };
  const raw = async (path, method = 'GET') => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie && { cookie }) },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    return { status: response.status, headers: response.headers, bytes, text };
  };
  const email = `assistant-flow-${randomUUID()}@example.test`;
  const registration = await request('/auth/register', 'POST', { name: 'Equipe QA', email, password: 'senha-local-sintetica' });
  assert.equal(registration.status, 201);
  return { email, request, raw };
}

test('clinic queue records handoffs, rejects stale updates and isolates contacts and permissions', async t => {
  const [owner, staff, viewer, outsider] = await Promise.all(Array.from({length:4}, account));
  const clinic = async actor => '/organizations/'+(await actor.request('/organizations','POST',{name:'Clínica QA'})).data.id;
  const root = await clinic(owner);
  const other = await clinic(outsider);
  for (const [member,role] of [[staff,'STAFF'],[viewer,'VIEWER']]) {
    assert.equal((await owner.request(root+'/members','POST',{email:member.email,role})).status,201);
  }
  const inbox = root+'/inbox';
  const contact = (await owner.request(root+'/contacts','POST',{name:'Contato QA'})).data;
  const foreign = (await outsider.request(other+'/contacts','POST',{name:'Outro contato'})).data;
  const created = await owner.request(inbox,'POST',{subject:'Retorno da consulta'});
  assert.equal(created.status,201);
  const path = inbox+'/'+created.data.id;
  const edit = (actor,version,action) => actor.request(path,'PATCH',{version,action});
  const assignee = (await staff.request(inbox)).data.me;
  const me = (await owner.request(inbox)).data.me;
  assert.equal((await edit(owner,1,{kind:'assign',assigneeId:me})).status,200);
  assert.equal((await edit(owner,1,{kind:'close'})).status,409);
  assert.equal((await edit(owner,2,{kind:'contact',contactId:foreign.id})).status,404);
  assert.equal((await edit(owner,2,{kind:'contact',contactId:contact.id})).status,200);
  assert.equal((await edit(owner,3,{kind:'assign',assigneeId:assignee})).status,200);
  assert.equal((await edit(staff,4,{kind:'note',text:'Retorno combinado.'})).status,200);
  assert.equal((await edit(staff,5,{kind:'close'})).status,200);
  assert.equal((await edit(viewer,6,{kind:'reopen'})).status,403);
  assert.equal((await outsider.request(path)).status,404);
  assert.equal((await outsider.request(other+'/inbox/'+created.data.id)).status,404);
  const saved = (await viewer.request(path)).data;
  assert.equal(saved.closed,true);
  assert.equal(saved.assignee.id,assignee);
  assert.equal(saved.contact.id,contact.id);
  assert.deepEqual(saved.events.map(e=>e.actorId),[me,me,me,me,assignee,assignee]);
  assert.ok(saved.events.every(e=>Date.parse(e.createdAt)));
  assert.equal((await edit(staff,6,{kind:'reopen'})).status,200);
  await t.test('public capture attributes anonymous retries to one clinic', async()=>{
    const clinicId = root.split('/').pop();
    const url = base+'/public/capture/'+clinicId;
    const post = body => fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const data = {name:'Lead QA',email:'lead@example.test',source:'INSTAGRAM',requestId:randomUUID()};
    assert.equal((await post({...data,email:undefined})).status,400);
    assert.equal((await post({...data,organizationId:randomUUID()})).status,400);
    const results=await Promise.all([post(data),post(data)]);
    assert.ok(results.every(response=>response.status===201));
    const captured=(await owner.request(root+'/contacts')).data.filter(row=>row.email===data.email);
    assert.equal(captured.length,1);
    assert.equal(captured[0].source,'INSTAGRAM');
    assert.equal((await outsider.request(other+'/contacts')).data.some(row=>row.email===data.email),false);
  });
  await t.test('independent capture pages, explicit consent and follow-up',async()=>{
    const design={specialty:'Psicologia',title:'Atendimento psicológico',description:'Fale com nossa equipe.',button:'Pedir retorno',color:'#484064',logo:''};
    const path=root+'/capture-page/publish';
    assert.equal((await viewer.request(path,'POST',design)).status,403);
    assert.equal((await outsider.request(path,'POST',design)).status,404);
    assert.equal((await owner.request(path,'POST',design)).status,201);
    const otherDesign={...design,specialty:'Odontologia',title:'Avaliação odontológica'};
    assert.equal((await outsider.request(other+'/capture-page/publish','POST',otherDesign)).status,201);
    for(const [actor,clinic,expected,consent] of [[owner,root,design,true],[outsider,other,otherDesign,false]]){
      const url=base+'/public/capture/'+clinic.split('/').pop();
      assert.deepEqual((await (await fetch(url)).json()).capturePage,expected);
      const request={name:'Contato de teste',email:'consulta@example.test',requestId:randomUUID(),marketingConsent:consent};
      assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)})).status,201);
      const contact=(await actor.request(clinic+'/contacts')).data.find(c=>c.email===request.email);
      assert.equal(Boolean(contact.marketingConsentAt),consent);
      const resource=clinic+'/contacts/'+contact.id;
      const followUpAt=new Date(Date.now()+3600000).toISOString();
      const edited=await actor.request(resource,'PATCH',{leadStatus:'WAITING',followUpAt});
      assert.equal(edited.data.leadStatus,'WAITING');assert.equal(edited.data.followUpAt,followUpAt);
      if(consent){
        await actor.request(resource+'/revoke-marketing','POST',{});
        assert.ok((await actor.request(clinic+'/contacts')).data.find(c=>c.id===contact.id).marketingRevokedAt);
      }
    }
  });
  await t.test('returns move from today to upcoming after explicit chat confirmation',async()=>{
    const path=root+'/follow-ups';
    const now=new Date().toISOString();
    const due=await owner.request(root+'/contacts','POST',{name:'Alice QA',followUpAt:now});
    const key=due.data.id;
    const list=async()=> (await owner.request(path)).data.find(r=>r.id===key);
    const chat=async(agent,message)=>(await owner.request(root+'/assistant/chats/'+agent,'POST',{message,requestId:randomUUID()})).data;
    assert.equal((await list()).bucket,'today');
    assert.match((await chat('main','Quem está esperando meu retorno?')).answer,/Alice QA/);
    assert.equal((await chat('crm','Remarque o retorno de Alice QA para amanhã às 14h')).tool,'followup_proposal');
    assert.equal((await list()).bucket,'today');
    assert.equal((await chat('crm','Confirmar retorno')).tool,'followup_changed');
    const moved=await list();
    assert.equal(moved.bucket,'upcoming');
    assert.equal((await viewer.request(path+'/'+key,'POST',{action:'done',expected:moved.followUpAt})).status,403);
    assert.equal((await outsider.request(path)).status,404);
    assert.equal((await owner.request(path+'/'+key,'POST',{action:'done',expected:now})).status,409);
    assert.equal((await owner.request(path+'/'+key,'POST',{action:'contacted',expected:moved.followUpAt})).status,201);
    assert.equal(await list(),undefined);
  });
  await t.test('conversion counts distinct contacts and isolates each organization', async()=>{
    const clinic=async()=>'/organizations/'+(await owner.request('/organizations','POST',{name:'Clínica QA'})).data.id;
  const root=await clinic();
  const other=await clinic();
  const add=(path,body)=>owner.request(path,'POST',body);
  const contact=(await add(root+'/contacts',{name:'Indicação QA',source:'REFERRAL'})).data;
  await add(root+'/contacts',{name:'Origem desconhecida'});
  await add(other+'/contacts',{name:'Outra clínica',source:'GOOGLE'});
  for (let i=0;i<2;i++) assert.equal((await add(root+'/opportunities',{title:'Oportunidade QA',contactId:contact.id,stage:'WON'})).status,201);
  assert.deepEqual((await owner.request(root+'/reports/acquisition')).data,[
    {source:'REFERRAL',contacts:1,converted:1},{source:'UNKNOWN',contacts:1,converted:0}
  ]);
  assert.deepEqual((await owner.request(other+'/reports/acquisition')).data,[{source:'GOOGLE',contacts:1,converted:0}]);
  });
  await t.test('manual campaigns enforce consent, phone integrity, RBAC, isolation and period report', async()=>{
    const campaignClinic = (await owner.request('/organizations','POST',{name:'Clínica Campanhas QA'})).data;
    const otherCampClinic = (await outsider.request('/organizations','POST',{name:'Outra Campanhas QA'})).data;
    const cRoot = '/organizations/' + campaignClinic.id;
    const oRoot = '/organizations/' + otherCampClinic.id;
    const staffMember = (await owner.request(cRoot+'/members','POST',{email:staff.email,role:'STAFF'})).data;
    assert.equal((await owner.request(cRoot+'/members','POST',{email:viewer.email,role:'VIEWER'})).status,201);
    const capture = async(clinicId,payload)=>{
      const response = await fetch(base+'/public/capture/'+clinicId,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),...payload}),
      });
      assert.equal(response.status,201);
    };
    await capture(campaignClinic.id,{name:'Ana Elegível',phone:'11991110001',source:'INSTAGRAM',marketingConsent:true});
    await capture(campaignClinic.id,{name:'Bruno Revogado',phone:'11991110002',source:'INSTAGRAM',marketingConsent:true});
    await capture(campaignClinic.id,{name:'Carla Troca Fone',phone:'11991110003',source:'INSTAGRAM',marketingConsent:true});
    await capture(campaignClinic.id,{name:'Diego Sem Optin',phone:'11991110004',source:'INSTAGRAM',marketingConsent:false});
    await capture(campaignClinic.id,{name:'Eva Sem Fone',email:'eva@example.test',source:'INSTAGRAM',marketingConsent:true});
    await capture(campaignClinic.id,{name:'Fábio Google',phone:'11991110005',source:'GOOGLE',marketingConsent:true});
    await capture(otherCampClinic.id,{name:'Gabi Externa',phone:'11991110006',source:'INSTAGRAM',marketingConsent:true});
    const listContacts = (await owner.request(cRoot+'/contacts')).data;
    const byName = label => listContacts.find(row=>row.name===label);
    const [ana,bruno,carla] = ['Ana Elegível','Bruno Revogado','Carla Troca Fone'].map(byName);
    const payload = {
      name:'Campanha revisão anual',objective:'Convidar pacientes para revisar agenda de retorno',source:'INSTAGRAM',
      message:'Olá! Estamos organizando os horários do mês na Clínica Campanhas QA. Caso não queira receber novidades, avise por aqui.',
    };
    assert.equal((await staff.request(cRoot+'/campaigns','POST',payload)).status,403);
    assert.equal((await viewer.request(cRoot+'/campaigns','POST',payload)).status,403);
    assert.equal((await outsider.request(cRoot+'/campaigns','POST',payload)).status,404);
    const createdCamp = await owner.request(cRoot+'/campaigns','POST',payload);
    assert.equal(createdCamp.status,201);
    assert.equal(createdCamp.data.total,3);
    const campaignId = createdCamp.data.id;
    assert.equal((await owner.request(cRoot+'/campaigns','POST',{...payload,source:'WEBSITE'})).status,409);
    assert.equal((await viewer.request(cRoot+'/campaigns')).status,403);
    assert.equal((await viewer.request(cRoot+'/campaigns/'+campaignId)).status,403);
    assert.equal((await viewer.request(cRoot+'/campaigns/report')).status,403);
    assert.equal((await outsider.request(cRoot+'/campaigns/'+campaignId)).status,404);
    const detail = await staff.request(cRoot+'/campaigns/'+campaignId);
    assert.equal(detail.status,200);
    assert.deepEqual(detail.data.recipients.map(r=>r.contactName),['Ana Elegível','Bruno Revogado','Carla Troca Fone']);
    const rec = cid => detail.data.recipients.find(r=>r.contactId===cid);
    const [anaRec,brunoRec,carlaRec] = [ana,bruno,carla].map(c=>rec(c.id));
    const prepared = await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${anaRec.id}/prepare`,'POST',{});
    assert.equal(prepared.status,201);
    assert.equal(prepared.data.phone,'11991110001');
    assert.equal((await viewer.request(cRoot+`/campaigns/${campaignId}/recipients/${anaRec.id}/sent`,'POST',{})).status,403);
    const sent = await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${anaRec.id}/sent`,'POST',{});
    assert.equal(sent.status,201);
    assert.ok(Date.parse(sent.data.sentAt));
    assert.equal((await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${anaRec.id}/sent`,'POST',{})).status,409);
    assert.equal((await owner.request(cRoot+`/contacts/${bruno.id}/revoke-marketing`,'POST',{})).status,201);
    assert.equal((await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${brunoRec.id}/prepare`,'POST',{})).status,409);
    assert.equal((await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${brunoRec.id}/sent`,'POST',{})).status,409);
    assert.equal((await owner.request(cRoot+`/contacts/${carla.id}`,'PATCH',{phone:'11988887777'})).status,200);
    assert.equal((await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${carlaRec.id}/prepare`,'POST',{})).status,409);
    assert.equal((await staff.request(cRoot+`/campaigns/${campaignId}/recipients/${carlaRec.id}/sent`,'POST',{})).status,409);
    const campList = (await owner.request(cRoot+'/campaigns')).data;
    assert.equal(campList[0].sent,1);
    assert.equal(campList[0].pending,2);
    assert.equal(campList[0].blocked,2);
    assert.equal(campList[0].eligible,0);
    const afterDetail = (await owner.request(cRoot+'/campaigns/'+campaignId)).data;
    assert.deepEqual(Object.fromEntries(afterDetail.recipients.map(r=>[r.contactName,r.state])),{
      'Ana Elegível':'SENT','Bruno Revogado':'BLOCKED','Carla Troca Fone':'BLOCKED',
    });
    const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
    const report = (await owner.request(cRoot+`/campaigns/report?from=${today}&to=${today}`)).data;
    assert.equal(report.pending,2);
    assert.equal(report.blocked,2);
    assert.deepEqual(report.sends,[{day:today,count:1}]);
    const otherReport = (await outsider.request(oRoot+`/campaigns/report?from=${today}&to=${today}`)).data;
    assert.deepEqual(otherReport.sends,[]);
    assert.equal(otherReport.pending,0);
    assert.equal((await owner.request(cRoot+'/campaigns/report?from=2026-12-10&to=2026-12-01')).status,400);
    assert.equal((await fetch(base+cRoot+'/members/'+staffMember.id,{method:'DELETE'})).status,401);
  });
  await t.test('finance basic enforces RBAC, isolation, reconciliation and cash closing lifecycle', async()=>{
    const finClinic = (await owner.request('/organizations','POST',{name:'Clínica Financeiro QA'})).data;
    const otherFinClinic = (await outsider.request('/organizations','POST',{name:'Outra Financeiro QA'})).data;
    const fRoot = '/organizations/' + finClinic.id;
    const oRoot = '/organizations/' + otherFinClinic.id;
    // Reuse existing accounts: staff as STAFF, viewer as VIEWER; create a manager clinic or swap roles cleanly
    // Wait: we can also test MANAGER using a second membership after testing VIEWER, or give viewer VIEWER first and later test MANAGER on a dedicated clinic!
    assert.equal((await owner.request(fRoot+'/members','POST',{email:staff.email,role:'STAFF'})).status,201);
    const viewerMem = (await owner.request(fRoot+'/members','POST',{email:viewer.email,role:'VIEWER'})).data;

    // VIEWER cannot access any finance route; outsider gets 404
    for (const path of ['/finance/summary','/finance/categories','/finance/entries','/finance/closings']) {
      assert.equal((await viewer.request(fRoot+path)).status,403);
      assert.equal((await outsider.request(fRoot+path)).status,404);
    }

    // Promote viewer -> MANAGER on this clinic after confirming VIEWER is blocked
    assert.equal((await owner.request(fRoot+'/members/'+viewerMem.id,'DELETE')).status,204);
    assert.equal((await owner.request(fRoot+'/members','POST',{email:viewer.email,role:'MANAGER'})).status,201);
    const manager = viewer;

    // Categories: STAFF blocked (403), MANAGER/OWNER allowed
    assert.equal((await staff.request(fRoot+'/finance/categories','POST',{name:'Consultas',type:'INCOME'})).status,403);
    const catIncome = await manager.request(fRoot+'/finance/categories','POST',{name:'Consultas',type:'INCOME'});
    assert.equal(catIncome.status,201);
    const catExpense = await owner.request(fRoot+'/finance/categories','POST',{name:'Aluguel',type:'EXPENSE'});
    assert.equal(catExpense.status,201);
    const catInactive = await manager.request(fRoot+'/finance/categories','POST',{name:'Antiga',type:'INCOME'});
    assert.equal((await manager.request(fRoot+'/finance/categories/'+catInactive.data.id,'PATCH',{active:false})).status,200);
    const foreignCat = (await outsider.request(oRoot+'/finance/categories','POST',{name:'Externa',type:'INCOME'})).data;
    const foreignPatient = (await outsider.request(oRoot+'/patients','POST',{name:'Paciente Externo Fin'})).data;
    const localPatient = (await owner.request(fRoot+'/patients','POST',{name:'Paciente Local Fin'})).data;

    const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());

    // Invalid cross-tenant, wrong type, inactive category rejected (400)
    assert.equal((await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Inválida externa',amountCents:10000,dueDate:today,categoryId:foreignCat.id,
    })).status,400);
    assert.equal((await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Tipo trocado',amountCents:10000,dueDate:today,categoryId:catExpense.data.id,
    })).status,400);
    assert.equal((await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Categoria inativa',amountCents:10000,dueDate:today,categoryId:catInactive.data.id,
    })).status,400);
    assert.equal((await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Paciente externo',amountCents:10000,dueDate:today,patientId:foreignPatient.id,
    })).status,400);

    // STAFF creates receivable, payable, extra receivable, and one to cancel
    const rec1 = (await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Consulta particular',amountCents:25000,dueDate:today,categoryId:catIncome.data.id,patientId:localPatient.id,
    })).data;
    const exp1 = (await staff.request(fRoot+'/finance/entries','POST',{
      type:'EXPENSE',description:'Aluguel sala',amountCents:10000,dueDate:today,categoryId:catExpense.data.id,
    })).data;
    const recLate = (await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Retorno pendente',amountCents:8000,dueDate:'2020-01-15',categoryId:catIncome.data.id,
    })).data;
    const toCancel = (await staff.request(fRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Lançamento duplicado',amountCents:5000,dueDate:today,
    })).data;

    // STAFF can edit PENDING, cannot cancel
    assert.equal((await staff.request(fRoot+'/finance/entries/'+rec1.id,'PATCH',{amountCents:30000})).data.amountCents,30000);
    assert.equal((await staff.request(fRoot+'/finance/entries/'+toCancel.id+'/cancel','POST',{})).status,403);
    assert.equal((await manager.request(fRoot+'/finance/entries/'+toCancel.id+'/cancel','POST',{})).data.status,'CANCELLED');

    // STAFF settles rec1 and exp1 manually
    const settledRec1 = await staff.request(fRoot+'/finance/entries/'+rec1.id+'/settle','POST',{settledDate:today,paymentMethod:'PIX'});
    assert.equal(settledRec1.status,201);
    assert.equal(settledRec1.data.status,'PAID');
    assert.equal((await staff.request(fRoot+'/finance/entries/'+exp1.id+'/settle','POST',{settledDate:today,paymentMethod:'TRANSFER'})).status,201);

    // Settled entry cannot be edited, cancelled or settled twice
    assert.equal((await owner.request(fRoot+'/finance/entries/'+rec1.id,'PATCH',{description:'Alteração indevida'})).status,409);
    assert.equal((await owner.request(fRoot+'/finance/entries/'+rec1.id+'/cancel','POST',{})).status,409);
    assert.equal((await staff.request(fRoot+'/finance/entries/'+rec1.id+'/settle','POST',{settledDate:today,paymentMethod:'CASH'})).status,409);

    // STAFF cannot reconcile or close cash (403)
    assert.equal((await staff.request(fRoot+'/finance/entries/'+rec1.id+'/reconcile','POST',{})).status,403);
    assert.equal((await staff.request(fRoot+'/finance/closings','POST',{closingDate:today})).status,403);

    // Cash closing fails while settled entries on that day are unreconciled (409)
    assert.equal((await manager.request(fRoot+'/finance/closings','POST',{closingDate:today})).status,409);

    // MANAGER reconciles both settled entries and closes the day
    assert.equal((await manager.request(fRoot+'/finance/entries/'+rec1.id+'/reconcile','POST',{})).status,201);
    assert.equal((await manager.request(fRoot+'/finance/entries/'+exp1.id+'/reconcile','POST',{})).status,201);
    const closed = await manager.request(fRoot+'/finance/closings','POST',{closingDate:today,notes:'Fechamento conferido'});
    assert.equal(closed.status,201);
    assert.equal(closed.data.receivedCents,30000);
    assert.equal(closed.data.paidCents,10000);
    assert.equal(closed.data.netCents,20000);
    assert.equal(closed.data.reconciledCount,2);

    // Closed day blocks new settlements on that date
    assert.equal((await staff.request(fRoot+'/finance/entries/'+recLate.id+'/settle','POST',{settledDate:today,paymentMethod:'CARD'})).status,409);

    // MANAGER cannot reopen closed cash (403); OWNER must provide reason (400 if empty)
    assert.equal((await manager.request(fRoot+'/finance/closings/'+closed.data.id+'/reopen','POST',{reason:'Ajuste de teste'})).status,403);
    assert.equal((await owner.request(fRoot+'/finance/closings/'+closed.data.id+'/reopen','POST',{reason:'abc'})).status,400);
    const reopened = await owner.request(fRoot+'/finance/closings/'+closed.data.id+'/reopen','POST',{reason:'Incluir recebimento esquecido do dia'});
    assert.equal(reopened.status,201);
    assert.equal(reopened.data.status,'REOPENED');

    // After reopening, settle + reconcile + re-close updates totals
    assert.equal((await staff.request(fRoot+'/finance/entries/'+recLate.id+'/settle','POST',{settledDate:today,paymentMethod:'CARD'})).status,201);
    assert.equal((await manager.request(fRoot+'/finance/entries/'+recLate.id+'/reconcile','POST',{})).status,201);
    const reclosed = await manager.request(fRoot+'/finance/closings','POST',{closingDate:today,notes:'Fechamento revisado'});
    assert.equal(reclosed.status,201);
    assert.equal(reclosed.data.receivedCents,38000);
    assert.equal(reclosed.data.paidCents,10000);
    assert.equal(reclosed.data.netCents,28000);
    assert.equal(reclosed.data.reconciledCount,3);

    // Summary reflects totals and isolates clinics
    const summary = (await staff.request(fRoot+`/finance/summary?from=${today}&to=${today}`)).data;
    assert.equal(summary.receivedCents,38000);
    assert.equal(summary.paidCents,10000);
    assert.equal(summary.netCents,28000);
    assert.equal(summary.unreconciledCount,0);
    assert.equal(summary.closedDaysCount,1);
    assert.equal(summary.byCategory.length,2);
    const otherSummary = (await outsider.request(oRoot+`/finance/summary?from=${today}&to=${today}`)).data;
    assert.equal(otherSummary.receivedCents,0);
    assert.equal(otherSummary.paidCents,0);
  });
  await t.test('packages and sessions enforce RBAC, isolation, finance entry generation, concurrency and revert', async()=>{
    const pkgClinic = (await owner.request('/organizations','POST',{name:'Clínica Pacotes QA'})).data;
    const otherPkgClinic = (await outsider.request('/organizations','POST',{name:'Outra Pacotes QA'})).data;
    const pRoot = '/organizations/' + pkgClinic.id;
    const oRoot = '/organizations/' + otherPkgClinic.id;
    assert.equal((await owner.request(pRoot+'/members','POST',{email:staff.email,role:'STAFF'})).status,201);
    const viewerMem = (await owner.request(pRoot+'/members','POST',{email:viewer.email,role:'VIEWER'})).data;

    // VIEWER blocked (403); outsider gets 404
    for (const path of ['/packages/catalog','/packages']) {
      assert.equal((await viewer.request(pRoot+path)).status,403);
      assert.equal((await outsider.request(pRoot+path)).status,404);
    }

    // Promote viewer to MANAGER on this clinic after testing VIEWER
    assert.equal((await owner.request(pRoot+'/members/'+viewerMem.id,'DELETE')).status,204);
    assert.equal((await owner.request(pRoot+'/members','POST',{email:viewer.email,role:'MANAGER'})).status,201);
    const manager = viewer;

    const service = (await owner.request(pRoot+'/services','POST',{name:'Fisioterapia',durationMinutes:45,priceCents:15000})).data;
    const patient = (await owner.request(pRoot+'/patients','POST',{name:'Paciente Pacote QA'})).data;
    const foreignPatient = (await outsider.request(oRoot+'/patients','POST',{name:'Paciente Externo Pacote'})).data;
    const catIncome = (await manager.request(pRoot+'/finance/categories','POST',{name:'Pacotes',type:'INCOME'})).data;

    // Catalog RBAC: STAFF gets 403; MANAGER creates active + inactive models
    assert.equal((await staff.request(pRoot+'/packages/catalog','POST',{name:'Bloqueado',totalSessions:5,priceCents:10000})).status,403);
    const model = (await manager.request(pRoot+'/packages/catalog','POST',{
      name:'Combo 2 sessões',serviceId:service.id,totalSessions:2,priceCents:30000,validityDays:60,
    })).data;
    const inactive = (await manager.request(pRoot+'/packages/catalog','POST',{name:'Descontinuado',totalSessions:3,priceCents:10000})).data;
    assert.equal((await manager.request(pRoot+'/packages/catalog/'+inactive.id,'PATCH',{active:false})).status,200);
    const foreignModel = (await outsider.request(oRoot+'/packages/catalog','POST',{name:'Externo',totalSessions:2,priceCents:5000})).data;

    // Cross-tenant and inactive rejections
    assert.equal((await staff.request(pRoot+'/packages/assign','POST',{patientId:foreignPatient.id,packageId:model.id})).status,400);
    assert.equal((await staff.request(pRoot+'/packages/assign','POST',{patientId:patient.id,packageId:foreignModel.id})).status,400);
    assert.equal((await staff.request(pRoot+'/packages/assign','POST',{patientId:patient.id,packageId:inactive.id})).status,400);

    // STAFF assigns package and creates linked FinanceEntry atomically
    const assigned = await staff.request(pRoot+'/packages/assign','POST',{
      patientId:patient.id,packageId:model.id,createFinanceEntry:true,categoryId:catIncome.id,notes:'Pagamento combinado',
    });
    assert.equal(assigned.status,201);
    assert.equal(assigned.data.remainingSessions,2);
    assert.ok(assigned.data.financeEntryId);
    const entries = (await staff.request(pRoot+'/finance/entries')).data;
    assert.ok(entries.some(e=>e.id===assigned.data.financeEntryId && e.amountCents===30000 && e.type==='INCOME' && e.status==='PENDING'));

    // Consume 1st session
    const after1 = await staff.request(pRoot+`/packages/${assigned.data.id}/consume`,'POST',{notes:'Sessão 1'});
    assert.equal(after1.status,201);
    assert.equal(after1.data.usedSessions,1);
    assert.equal(after1.data.remainingSessions,1);
    assert.equal(after1.data.status,'ACTIVE');

    // Concurrent consumption on the last remaining session: strictly 1 succeeds (201) and 1 fails (409)
    const race = await Promise.all([
      staff.request(pRoot+`/packages/${assigned.data.id}/consume`,'POST',{notes:'Sessão 2A'}),
      owner.request(pRoot+`/packages/${assigned.data.id}/consume`,'POST',{notes:'Sessão 2B'}),
    ]);
    assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
    const winner = race.find(r=>r.status===201).data;
    assert.equal(winner.usedSessions,2);
    assert.equal(winner.remainingSessions,0);
    assert.equal(winner.status,'COMPLETED');
    const latestUsageId = winner.usages[0].id;

    // Revert usage: STAFF blocked (403), MANAGER succeeds and reactivates package
    assert.equal((await staff.request(pRoot+`/packages/${assigned.data.id}/usages/${latestUsageId}/revert`,'POST',{})).status,403);
    const reverted = await manager.request(pRoot+`/packages/${assigned.data.id}/usages/${latestUsageId}/revert`,'POST',{});
    assert.equal(reverted.status,201);
    assert.equal(reverted.data.usedSessions,1);
    assert.equal(reverted.data.remainingSessions,1);
    assert.equal(reverted.data.status,'ACTIVE');
    assert.equal((await manager.request(pRoot+`/packages/${assigned.data.id}/usages/${latestUsageId}/revert`,'POST',{})).status,409);

    // Cancel package: STAFF blocked (403), MANAGER cancels; afterwards consume/revert return 409
    assert.equal((await staff.request(pRoot+`/packages/${assigned.data.id}/cancel`,'POST',{})).status,403);
    const cancelled = await manager.request(pRoot+`/packages/${assigned.data.id}/cancel`,'POST',{});
    assert.equal(cancelled.status,201);
    assert.equal(cancelled.data.status,'CANCELLED');
    assert.equal((await staff.request(pRoot+`/packages/${assigned.data.id}/consume`,'POST',{})).status,409);

    // Expired package blocks consumption
    const expiredPkg = (await staff.request(pRoot+'/packages/assign','POST',{
      patientId:patient.id,packageId:model.id,purchasedAt:'2019-12-01',expiresAt:'2020-01-01',
    })).data;
    assert.equal(expiredPkg.expired,true);
    assert.equal((await staff.request(pRoot+`/packages/${expiredPkg.id}/consume`,'POST',{})).status,409);

    // Outsider sees zero packages
    assert.deepEqual((await outsider.request(oRoot+'/packages')).data,[]);
  });
  await t.test('finance reports breakdown and CSV export enforce RBAC, isolation, aggregations and format', async()=>{
    const repClinic = (await owner.request('/organizations','POST',{name:'Clínica Relatórios QA'})).data;
    const otherRepClinic = (await outsider.request('/organizations','POST',{name:'Outra Relatórios QA'})).data;
    const rRoot = '/organizations/' + repClinic.id;
    const oRoot = '/organizations/' + otherRepClinic.id;
    assert.equal((await owner.request(rRoot+'/members','POST',{email:staff.email,role:'STAFF'})).status,201);
    assert.equal((await owner.request(rRoot+'/members','POST',{email:viewer.email,role:'VIEWER'})).status,201);

    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: repClinic.timezone }).format(new Date());
    const pastDate = '2020-05-10';

    // RBAC: VIEWER gets 403, outsider gets 404
    assert.equal((await viewer.request(rRoot+`/finance/reports/breakdown?from=${today}&to=${today}`)).status,403);
    assert.equal((await viewer.raw(rRoot+`/finance/reports/export.csv?from=${today}&to=${today}`)).status,403);
    assert.equal((await outsider.request(rRoot+`/finance/reports/breakdown?from=${today}&to=${today}`)).status,404);
    assert.equal((await outsider.raw(rRoot+`/finance/reports/export.csv?from=${today}&to=${today}`)).status,404);

    const catIncome = (await owner.request(rRoot+'/finance/categories','POST',{name:'Consultas',type:'INCOME'})).data;
    const catExpense = (await owner.request(rRoot+'/finance/categories','POST',{name:'Insumos',type:'EXPENSE'})).data;
    const profA = (await owner.request(rRoot+'/professionals','POST',{name:'Dra. Helena'})).data;
    const profB = (await owner.request(rRoot+'/professionals','POST',{name:'Dr. Bruno'})).data;
    const patient = (await owner.request(rRoot+'/patients','POST',{name:'Paciente Relatório'})).data;

    // Paid incomes: 2 PIX (15000 + 25000) for profA, 1 CARD (20000) for profB
    const inc1 = (await staff.request(rRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Consulta 1',amountCents:15000,dueDate:today,categoryId:catIncome.id,patientId:patient.id,professionalId:profA.id,
    })).data;
    const inc2 = (await staff.request(rRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Consulta 2',amountCents:25000,dueDate:today,categoryId:catIncome.id,patientId:patient.id,professionalId:profA.id,
    })).data;
    const inc3 = (await staff.request(rRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Avaliação',amountCents:20000,dueDate:today,categoryId:catIncome.id,professionalId:profB.id,
    })).data;
    const exp1 = (await staff.request(rRoot+'/finance/entries','POST',{
      type:'EXPENSE',description:'Luvas e álcool',amountCents:5000,dueDate:today,categoryId:catExpense.id,
    })).data;
    // Overdue receivable (dueDate < today, PENDING)
    const overdueEntry = (await staff.request(rRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Mensalidade atrasada',amountCents:18000,dueDate:pastDate,categoryId:catIncome.id,patientId:patient.id,
    })).data;

    assert.equal((await staff.request(rRoot+`/finance/entries/${inc1.id}/settle`,'POST',{settledDate:today,paymentMethod:'PIX'})).status,201);
    assert.equal((await staff.request(rRoot+`/finance/entries/${inc2.id}/settle`,'POST',{settledDate:today,paymentMethod:'PIX'})).status,201);
    assert.equal((await staff.request(rRoot+`/finance/entries/${inc3.id}/settle`,'POST',{settledDate:today,paymentMethod:'CARD'})).status,201);
    assert.equal((await staff.request(rRoot+`/finance/entries/${exp1.id}/settle`,'POST',{settledDate:today,paymentMethod:'TRANSFER'})).status,201);

    // Reconcile all and close cash for today
    for (const id of [inc1.id, inc2.id, inc3.id, exp1.id]) {
      assert.equal((await owner.request(rRoot+`/finance/entries/${id}/reconcile`,'POST',{})).status,201);
    }
    assert.equal((await owner.request(rRoot+'/finance/closings','POST',{closingDate:today})).status,201);

    // Breakdown checks (STAFF allowed)
    const breakdownRes = await staff.request(rRoot+`/finance/reports/breakdown?from=${today}&to=${today}`);
    assert.equal(breakdownRes.status,200);
    const b = breakdownRes.data;
    assert.equal(b.totals.receivedCents,60000);
    assert.equal(b.totals.paidCents,5000);
    assert.equal(b.totals.netCents,55000);

    // By payment method
    const pix = b.byPaymentMethod.find(m=>m.paymentMethod==='PIX');
    const card = b.byPaymentMethod.find(m=>m.paymentMethod==='CARD');
    assert.equal(pix.amountCents,40000);
    assert.equal(pix.count,2);
    assert.equal(card.amountCents,20000);
    assert.equal(card.count,1);

    // By category
    assert.equal(b.byCategory.length,2);
    assert.equal(b.byCategory.find(c=>c.type==='INCOME').totalCents,60000);
    assert.equal(b.byCategory.find(c=>c.type==='EXPENSE').totalCents,5000);

    // By professional
    const pA = b.byProfessional.find(p=>p.professionalId===profA.id);
    const pB = b.byProfessional.find(p=>p.professionalId===profB.id);
    assert.equal(pA.amountCents,40000);
    assert.equal(pA.count,2);
    assert.equal(pA.averageTicketCents,20000);
    assert.equal(pB.amountCents,20000);
    assert.equal(pB.count,1);
    assert.equal(pB.averageTicketCents,20000);

    // Daily flow
    assert.equal(b.dailyFlow.length,1);
    assert.equal(b.dailyFlow[0].date,today);
    assert.equal(b.dailyFlow[0].receivedCents,60000);
    assert.equal(b.dailyFlow[0].paidCents,5000);
    assert.equal(b.dailyFlow[0].cashClosed,true);

    // Overdue
    assert.equal(b.overdue.receivableCents,18000);
    assert.equal(b.overdue.receivableCount,1);
    assert.equal(b.overdue.topItems.length,1);
    assert.equal(b.overdue.topItems[0].id,overdueEntry.id);
    assert.ok(b.overdue.topItems[0].daysOverdue > 0);

    // CSV export checks
    const csvRes = await staff.raw(rRoot+`/finance/reports/export.csv?from=${today}&to=${today}&type=ALL`);
    assert.equal(csvRes.status,200);
    assert.match(csvRes.headers.get('content-type') ?? '', /text\/csv;\s*charset=utf-8/i);
    assert.match(csvRes.headers.get('content-disposition') ?? '', /attachment;\s*filename="financeiro-clinica-relatorios-qa-/);
    assert.deepEqual([...csvRes.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'CSV should start with UTF-8 BOM');
    const csvLines = csvRes.text.slice(1).split(/\r?\n/);
    assert.equal(
      csvLines[0],
      'Vencimento;Data do Caixa;Tipo;Situação;Descrição;Categoria;Paciente;Profissional;Forma de Pagamento;Valor (R$);Conferido',
    );
    assert.equal(csvLines.length,5); // header + 4 entries in today's range
    assert.ok(csvRes.text.includes(';Consulta 1;Consultas;Paciente Relatório;Dra. Helena;Pix;150,00;Sim'));
    assert.ok(csvRes.text.includes(';Luvas e álcool;Insumos;;;Transferência;50,00;Sim'));

    // Outsider clinic isolation
    const otherBreakdown = (await outsider.request(oRoot+`/finance/reports/breakdown?from=${today}&to=${today}`)).data;
    assert.equal(otherBreakdown.totals.receivedCents,0);
    assert.equal(otherBreakdown.overdue.totalCount,0);
  });
  await t.test('super admin provisioning, AI metrics and strict RBAC/isolation', async()=>{
    // Ordinary users (OWNER, STAFF, VIEWER) are strictly blocked (403) from all /api/admin/* endpoints
    for (const actor of [owner, staff, viewer]) {
      assert.equal((await actor.request('/admin/organizations')).status, 403);
      assert.equal((await actor.request('/admin/metrics/ai')).status, 403);
      assert.equal(
        (await actor.request('/admin/organizations/provision', 'POST', {
          name: 'Clínica Bloqueada',
          timezone: 'America/Sao_Paulo',
          ownerName: 'Bloqueado',
          ownerEmail: `blocked-${randomUUID()}@example.test`,
        })).status,
        403,
      );
    }

    // Promote owner to platform Super Admin using the official CLI script
    execFileSync(process.execPath, ['dist/promote-admin.js', owner.email], { stdio: 'pipe' });

    // Provision Clinic A with a brand new owner account
    const newOwnerEmail = `dra-provisionada-${randomUUID()}@example.test`;
    const provA = await owner.request('/admin/organizations/provision', 'POST', {
      name: 'Clínica Provisionada A',
      timezone: 'America/Sao_Paulo',
      ownerName: 'Dra. Camila Provisionada',
      ownerEmail: newOwnerEmail,
    });
    assert.equal(provA.status, 201);
    assert.equal(provA.data.organization.name, 'Clínica Provisionada A');
    assert.equal(provA.data.owner.email, newOwnerEmail);
    assert.equal(provA.data.owner.createdNewUser, true);
    assert.ok(typeof provA.data.temporaryPassword === 'string' && provA.data.temporaryPassword.length >= 12);
    assert.equal(provA.data.loginPath, '/clinica');

    // New owner logs in with temporary password and accesses Clinic A as OWNER
    let newCookie;
    const newOwnerReq = async (path, method = 'GET', body) => {
      const response = await fetch(base + path, {
        method,
        headers: { ...(newCookie && { cookie: newCookie }), ...(body && { 'content-type': 'application/json' }) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const session = response.headers.get('set-cookie');
      if (session) newCookie = session.split(';')[0];
      return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
    };
    const loginRes = await newOwnerReq('/auth/login', 'POST', {
      email: newOwnerEmail,
      password: provA.data.temporaryPassword,
    });
    assert.equal(loginRes.status, 200);
    const clinicAId = provA.data.organization.id;
    assert.equal((await newOwnerReq(`/organizations/${clinicAId}`)).status, 200);
    assert.equal((await newOwnerReq(`/organizations/${clinicAId}/members`)).status, 200);

    // Provision Clinic B with an existing user (outsider): links as OWNER without temporary password
    const provB = await owner.request('/admin/organizations/provision', 'POST', {
      name: 'Clínica Provisionada B',
      timezone: 'America/Manaus',
      ownerName: 'Dono Existente QA',
      ownerEmail: outsider.email,
    });
    assert.equal(provB.status, 201);
    assert.equal(provB.data.owner.createdNewUser, false);
    assert.equal(provB.data.temporaryPassword, null);
    const clinicBId = provB.data.organization.id;

    // Strict isolation between provisioned clinics
    assert.equal((await newOwnerReq(`/organizations/${clinicBId}`)).status, 404);
    assert.equal((await outsider.request(`/organizations/${clinicAId}`)).status, 404);
    assert.equal((await outsider.request(`/organizations/${clinicBId}`)).status, 200);

    // Admin organization listing includes memberCount, lastActivityAt and AI monthly fields
    const listRes = await owner.request('/admin/organizations');
    assert.equal(listRes.status, 200);
    const listedA = listRes.data.find((org) => org.id === clinicAId);
    assert.ok(listedA);
    assert.equal(listedA.memberCount, 1);
    assert.equal(typeof listedA.aiMonthCalls, 'number');
    assert.equal(typeof listedA.aiMonthTokens, 'number');
    assert.ok(listedA.lastActivityAt);

    // Admin AI metrics endpoint returns totals, limits and per-organization rows
    const aiRes = await owner.request('/admin/metrics/ai');
    assert.equal(aiRes.status, 200);
    assert.ok(aiRes.data.dailyCallLimit > 0);
    assert.ok(aiRes.data.dailyTokenLimit > 0);
    assert.ok(aiRes.data.byOrganization.some((row) => row.organizationId === clinicAId));
    assert.ok(aiRes.data.byOrganization.some((row) => row.organizationId === clinicBId));
  });
  await t.test('internationalization supports USD/en-US config, finance metadata, English chat booking/confirm and isolation', async()=>{
    const usClinic = (await owner.request('/organizations','POST',{
      name:'Miami Health Clinic',timezone:'America/New_York',currency:'USD',locale:'en-US',
    })).data;
    const brClinic = (await outsider.request('/organizations','POST',{
      name:'Clínica São Paulo',timezone:'America/Sao_Paulo',currency:'BRL',locale:'pt-BR',
    })).data;
    assert.equal(usClinic.currency,'USD');
    assert.equal(usClinic.locale,'en-US');
    assert.equal(brClinic.currency,'BRL');
    assert.equal(brClinic.locale,'pt-BR');

    const uRoot = '/organizations/' + usClinic.id;
    const bRoot = '/organizations/' + brClinic.id;

    // PATCH currency/locale
    const patched = await owner.request(uRoot,'PATCH',{currency:'EUR',locale:'en-US'});
    assert.equal(patched.status,200);
    assert.equal(patched.data.currency,'EUR');
    assert.equal((await owner.request(uRoot,'PATCH',{currency:'USD',locale:'en-US'})).status,200);

    // Finance summary & breakdown reflect USD / en-US and isolate from Brazilian clinic
    const usToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York' }).format(new Date());
    const entry = (await owner.request(uRoot+'/finance/entries','POST',{
      type:'INCOME',description:'Initial Consultation',amountCents:15000,dueDate:usToday,
    })).data;
    assert.equal((await owner.request(uRoot+`/finance/entries/${entry.id}/settle`,'POST',{settledDate:usToday,paymentMethod:'CARD'})).status,201);

    const usSummary = (await owner.request(uRoot+`/finance/summary?from=${usToday}&to=${usToday}`)).data;
    assert.equal(usSummary.currency,'USD');
    assert.equal(usSummary.locale,'en-US');
    assert.equal(usSummary.receivedCents,15000);

    const usBreakdown = (await owner.request(uRoot+`/finance/reports/breakdown?from=${usToday}&to=${usToday}`)).data;
    assert.equal(usBreakdown.currency,'USD');
    assert.equal(usBreakdown.locale,'en-US');
    assert.equal(usBreakdown.totals.receivedCents,15000);

    // Brazilian clinic remains isolated in BRL / pt-BR with 0 received
    const brSummary = (await outsider.request(bRoot+`/finance/summary?from=${usToday}&to=${usToday}`)).data;
    assert.equal(brSummary.currency,'BRL');
    assert.equal(brSummary.locale,'pt-BR');
    assert.equal(brSummary.receivedCents,0);
    assert.equal((await outsider.request(uRoot+`/finance/summary?from=${usToday}&to=${usToday}`)).status,404);

    // English chat booking + confirmation flow
    const unit = (await owner.request(uRoot+'/units','POST',{name:'Main Wing'})).data;
    const service = (await owner.request(uRoot+'/services','POST',{name:'General Consultation',durationMinutes:30,priceCents:15000})).data;
    const prof = (await owner.request(uRoot+'/professionals','POST',{name:'Dr. John Smith'})).data;
    const patient = (await owner.request(uRoot+'/patients','POST',{name:'John Doe'})).data;
    assert.ok(unit.id && service.id && prof.id && patient.id);

    const step1 = await owner.request(uRoot+'/assistant/chats/agenda','POST',{
      message:'Schedule an appointment for patient John Doe tomorrow at 3pm',requestId:randomUUID(),
    });
    assert.equal(step1.status,200);
    assert.match(step1.data.answer, /John Doe/);
    const step2 = await owner.request(uRoot+'/assistant/chats/agenda','POST',{
      message:'yes',requestId:randomUUID(),
    });
    assert.equal(step2.status,200);

    const appts = (await owner.request(uRoot+'/appointments')).data;
    assert.equal(appts.length,1);
    assert.equal(appts[0].patientId,patient.id);
    assert.equal(appts[0].status,'SCHEDULED');

    // Confirm appointment in English via chat
    const conf1 = await owner.request(uRoot+'/assistant/chats/agenda','POST',{
      message:'Confirm patient John Doe',requestId:randomUUID(),
    });
    assert.equal(conf1.status,200);
    const conf2 = await owner.request(uRoot+'/assistant/chats/agenda','POST',{
      message:'yes',requestId:randomUUID(),
    });
    assert.equal(conf2.status,200);

    const apptsAfter = (await owner.request(uRoot+'/appointments')).data;
    assert.equal(apptsAfter[0].status,'CONFIRMED');
  });
});
