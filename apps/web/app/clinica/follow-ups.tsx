"use client";
import {useCallback,useState} from "react";
import {api,displayDate,errorMessage,zonedToIso,type Organization} from "./data";
import {Dialog,Empty,ErrorText,LoadError,Loading,useLoad} from "./components";

type Bucket="overdue"|"today"|"upcoming";
type Lead={id:string;name:string;followUpAt:string;bucket:Bucket};
const groups:Record<Bucket,string>={overdue:"Atrasados",today:"Hoje",upcoming:"Próximos"};
export function FollowUps({organization,canWrite}:{organization:Organization;canWrite:boolean}){
  const path='/organizations/'+organization.id+'/follow-ups';
  const load=useLoad(useCallback((signal:AbortSignal)=>api<Lead[]>(path,"GET",undefined,signal),[path]));
  const [editing,setEditing]=useState<Lead>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function change(row:Lead,action:string,local?:string){
    setBusy(true);setError("");setNotice("");
    try{
      const next=local ? zonedToIso(local,organization.timezone) : undefined;
      await api(path+'/'+row.id,"POST",{action,next,expected:row.followUpAt});
      setEditing(undefined);setNotice(action==="done"?"Acompanhamento concluído.":action==="contacted"?"Contato registrado.":"Retorno remarcado.");
    }catch(e){setError(e instanceof Error?e.message:errorMessage(e));}
    finally{setBusy(false);load.reload();}
  }
  const isEn = organization.locale === "en-US";
  const groupLabels: Record<Bucket, string> = isEn
    ? { overdue: "Overdue", today: "Today", upcoming: "Upcoming" }
    : groups;
  if(load.error)return <LoadError message={load.error} retry={load.reload}/>;
  const leads=load.data; if(!leads)return <Loading label={isEn ? "Loading…" : "Carregando…"}/>;
  return <section className="panel"><div className="panel-heading"><h2>{isEn ? "Follow-up queue" : "Fila de retornos"}</h2><button className="button secondary" onClick={load.reload}>{isEn ? "Refresh queue" : "Atualizar fila"}</button></div>
    {notice && <p role="status">{notice}</p>}{error && !editing && <ErrorText>{error}</ErrorText>}
    {!leads.length && <Empty>{isEn ? "No follow-ups scheduled. Set the next follow-up date under Contacts." : "Nenhum retorno agendado. Defina o próximo retorno em Contatos."}</Empty>}
    {(Object.keys(groups) as Bucket[]).map(bucket=>{
      const rows=leads.filter(r=>r.bucket===bucket);
      return rows.length>0 && <section key={bucket}><h3>{groupLabels[bucket]} ({rows.length})</h3><div className="table-scroll"><table><tbody>{rows.map(row=><tr key={row.id}>
        <th scope="row">{row.name}</th><td>{displayDate(row.followUpAt,organization.timezone,{dateStyle:"short",timeStyle:"short"},organization.locale)}</td>
        {canWrite && <td><div className="quick-actions"><button className="button secondary" disabled={busy} onClick={()=>change(row,"contacted")}>{isEn ? "Mark contacted" : "Registrar contato"}</button>
        <button className="button secondary" disabled={busy} onClick={()=>{setError("");setEditing(row);}}>{isEn ? "Reschedule" : "Remarcar"}</button>
        <button className="button ghost" disabled={busy} onClick={()=>change(row,"done")}>{isEn ? "Complete" : "Concluir"}</button></div></td>}</tr>)}</tbody></table></div></section>;
    })}
    {editing && <Dialog title={"Remarcar retorno de "+editing.name} onClose={()=>setEditing(undefined)} busy={busy}>
      <form onSubmit={e=>{e.preventDefault();void change(editing,"reschedule",String(new FormData(e.currentTarget).get("next")));}}>
      <label className="form-field">Nova data e hora ({organization.timezone})<input name="next" type="datetime-local" required/></label>
      {error && <ErrorText>{error}</ErrorText>}<button className="button primary" disabled={busy}>Salvar retorno</button></form></Dialog>}
  </section>;
}
