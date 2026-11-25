"use client";
import {useCallback,useState} from "react";
import {api,displayDate,errorMessage,type Organization} from "./data";
import {t} from "../i18n/translations";
import {Dialog,ErrorText,LoadError,useLoad} from "./components";

type Draft={phone:string;startAt:string;patientId:string;text:string;source:string};
export function ReminderQueue({organization}:{organization:Organization}) {
  const root='/organizations/'+organization.id+'/reminders';
  const load=useLoad(useCallback((signal:AbortSignal)=>api<{id:string;name:string;startAt:string}[]>(root+'/queue','GET',undefined,signal),[root]));
  const [draft,setDraft]=useState<(Draft & {id:string;name:string})>();
  const [opened,setOpened]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function prepare(id:string,name:string) {
    setError('');setBusy(true);setOpened(false);
    try { setDraft({...await api<Draft>(root+'/'+id+'/draft','POST'),id,name}); }
    catch(e){setError(errorMessage(e));} finally {setBusy(false);}
  }
  async function mark() {
    if (!draft) return;
    setBusy(true);setError('');
    try {await api(root+'/'+draft.id+'/sent','POST',{startAt:draft.startAt,phone:draft.phone,patientId:draft.patientId});setDraft(undefined);load.reload();}
    catch(e){setError(errorMessage(e));} finally {setBusy(false);}
  }
  const isEn = organization.locale === "en-US";
  return <section className="panel"><div className="panel-heading"><h2>{isEn ? "Next 24h reminders" : "Lembretes das próximas 24 horas"}</h2><button className="button secondary" onClick={load.reload}>{isEn ? "Refresh queue" : "Atualizar fila"}</button></div>
    {load.error ? <LoadError message={load.error} retry={load.reload}/> : !load.data ? <p>{isEn ? "Loading reminders…" : "Carregando lembretes…"}</p> : !load.data.length ? <p>{isEn ? "No appointments with pending reminders." : "Nenhuma consulta com lembrete pendente."}</p> :
      <ul>{load.data.map(a=><li key={a.id}>{a.name} · {displayDate(a.startAt,organization.timezone,{dateStyle:'short',timeStyle:'short'},organization.locale)} <button className="button secondary" disabled={busy} onClick={()=>prepare(a.id,a.name)}>{isEn ? "Prepare reminder" : "Preparar lembrete"}</button></li>)}</ul>}
    {error && !draft && <ErrorText>{error}</ErrorText>}
    {draft && <Dialog title={'Lembrete para '+draft.name} onClose={()=>setDraft(undefined)} busy={busy}>
      <label className="form-field">Mensagem · {draft.source}<textarea rows={5} value={draft.text} onChange={e=>{setDraft({...draft,text:e.target.value});setOpened(false);}}/></label>
      <p>Destinatário +{draft.phone}. Envie pela conta do WhatsApp da clínica.</p>
      {error && <ErrorText>{error}</ErrorText>}
      {draft.text.trim() && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a className="button primary" target="_blank" rel="noopener noreferrer" href={'https://wa.me/'+draft.phone+'?text='+encodeURIComponent(draft.text)} onClick={()=>setOpened(true)}>{t(organization.locale, "channel_whatsapp")}</a>
          <a className="button secondary" href={'sms:+'+draft.phone+'?body='+encodeURIComponent(draft.text)} onClick={()=>setOpened(true)}>{t(organization.locale, "channel_sms")}</a>
          <a className="button ghost" href={'mailto:?subject='+encodeURIComponent('Appointment reminder — '+organization.name)+'&body='+encodeURIComponent(draft.text)} onClick={()=>setOpened(true)}>{t(organization.locale, "channel_email")}</a>
        </div>
      )}
      {opened && <button className="button secondary" disabled={busy} onClick={mark}>Já enviei · registrar envio</button>}
    </Dialog>}
  </section>;
}
