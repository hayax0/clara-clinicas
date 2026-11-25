"use client";

import { useCallback, useState, type FormEvent } from "react";
import { api, displayDate, errorMessage, type Organization } from "./data";
import { Dialog, Empty, ErrorText, Loading, LoadError, useLoad } from "./components";

type Person = { id: string; name: string };
type Thread = { id: string; subject: string; assignee: Person | null; contact: Person | null; closed: boolean; version: number };
type Entry = { delivery?:string; id: string; actor: string; text: string; createdAt: string };
type QueueData = { threads: Thread[]; me: string; members: Person[]; contacts: Person[] };
const status = (t: Thread) => t.closed ? "Concluídas" : t.assignee ? "Atribuídas" : "Abertas";

export function Queue({ organization, canWrite }: { organization: Organization; canWrite: boolean }) {
  const path = `/organizations/${organization.id}/inbox`;
  const load = useLoad(useCallback((signal: AbortSignal) => api<QueueData>(path, "GET", undefined, signal), [path]));
  const [filter, setFilter] = useState("Abertas");
  const [selected, select] = useState("");
  const [creating, create] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await api<Thread>(path, "POST", { subject: input.get("subject"), contactId: input.get("contact") || undefined });
      create(false); setFilter("Abertas"); select(result.id); load.reload();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  if (load.error) return <LoadError message={load.error} retry={load.reload}/>;
  if (!load.data) return <Loading/>;
  const data = load.data;
  const rows = data.threads.filter(t => status(t) === filter);
  const isEn = organization.locale === "en-US";
  const statusLabels: Record<string, string> = isEn
    ? { Abertas: "Open", Atribuídas: "Assigned", Concluídas: "Closed" }
    : { Abertas: "Abertas", Atribuídas: "Atribuídas", Concluídas: "Concluídas" };
  return <section className="panel">
    <div className="panel-heading"><h2>{isEn ? "Inbox queue" : "Caixa de entrada"}</h2><div className="quick-actions">
      <button className="button secondary" onClick={load.reload}>{isEn ? "Refresh queue" : "Atualizar fila"}</button>
      {canWrite && <button className="button primary" onClick={() => { setError(""); create(true); }}>{isEn ? "New conversation" : "Novo atendimento"}</button>}
    </div></div>
    <div className="segments" aria-label={isEn ? "Conversation status" : "Status da conversa"}>{["Abertas","Atribuídas","Concluídas"].map(f =>
      <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); select(""); }}>{statusLabels[f]} ({data.threads.filter(t => status(t) === f).length})</button>)}</div>
    {rows.length ? <ul>{rows.map(t => <li key={t.id}><button className="button ghost" aria-pressed={selected === t.id} onClick={() => select(t.id)}>{t.subject}</button> {t.contact?.name} {t.assignee && " · "+t.assignee.name}</li>)}</ul> : <Empty>{isEn ? "No conversations in this queue." : "Nenhuma conversa nesta fila."}</Empty>}
    {selected && <Conversation key={selected} path={path+"/"+selected} data={data} canWrite={canWrite} timezone={organization.timezone} locale={organization.locale ?? "pt-BR"} updated={f => {setFilter(f); load.reload();}}/>}
    {creating && <Dialog title="Novo atendimento" busy={busy} onClose={() => create(false)}><form onSubmit={submit}>
      <label className="form-field">Assunto<input name="subject" required minLength={2} maxLength={120} autoFocus/></label>
      <label className="form-field">Contato<select name="contact"><option value="">Vincular depois</option>{data.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {error && <ErrorText>{error}</ErrorText>}<button className="button primary" disabled={busy}>Abrir atendimento</button>
    </form></Dialog>}
  </section>;
}

function Conversation({path, data, canWrite, timezone, locale, updated}: {path: string; data: QueueData; canWrite: boolean; timezone: string; locale: string; updated: (filter: string) => void}) {
  const load = useLoad(useCallback((signal: AbortSignal) => api<Thread & {events: Entry[]}>(path,"GET",undefined,signal),[path]));
  const [note,setNote] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const thread = load.data;
  async function act(action: Record<string,string>) {
    if (!thread || busy) return;
    setBusy(true); setError("");
    try {
      await api(path,"PATCH",{ version:thread.version, action });
      if (action.kind === "note") setNote("");
      updated(status({...thread, closed: action.kind === "close" || (thread.closed && action.kind !== "reopen"), assignee: action.kind === "assign" ? {id:action.assigneeId,name:""} : thread.assignee}));
    } catch (err) { setError(errorMessage(err)); }
    finally { load.reload(); setBusy(false); }
  }
  if (load.error) return <LoadError message={load.error} retry={load.reload}/>;
  if (!thread) return <Loading/>;
  return <section className="panel"><h3>{thread.subject}</h3><p>{thread.contact?.name ?? "Sem contato vinculado"} · {thread.assignee?.name ?? "Aguardando responsável"}</p>
    <ol>{thread.events.map(e => <li key={e.id}><strong>{e.actor}</strong> · {displayDate(e.createdAt,timezone,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"},locale)}<p>{e.text}</p>{e.delivery && <small>{{pending:"Envio iniciado",accepted:"Aceita pelo canal",sent:"Enviada",delivered:"Entregue",read:"Lida",failed:"Falha no envio",unknown:"Envio sem confirmação"}[e.delivery]}</small>}</li>)}</ol>
    {error && <ErrorText>{error}</ErrorText>}
    {canWrite && <fieldset disabled={busy}><legend>Ações do atendimento</legend>
      {!thread.closed && <>
        {thread.assignee?.id !== data.me && <button className="button secondary" onClick={() => act({kind:"assign",assigneeId:data.me})}>Assumir atendimento</button>}
        <label className="form-field">Transferir para<select value="" onChange={e => act({kind:"assign",assigneeId:e.target.value})}><option value="">Selecionar responsável</option>{data.members.filter(m=>m.id!==thread.assignee?.id).map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <label className="form-field">Contato do CRM<select value={thread.contact?.id ?? ""} onChange={e => act({kind:"contact",contactId:e.target.value})}><option disabled value="">Selecionar contato</option>{data.contacts.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <form onSubmit={e=>{e.preventDefault();void act({kind:"note",text:note});}}><label className="form-field">Anotação interna<textarea value={note} onChange={e=>setNote(e.target.value)} required maxLength={2000}/></label><button className="button secondary" disabled={!note.trim()}>Registrar anotação</button></form>
      </>}
      <button className="button secondary" onClick={()=>act({kind:thread.closed?"reopen":"close"})}>{thread.closed?"Reabrir atendimento":"Concluir atendimento"}</button>
    </fieldset>}
  </section>;
}
