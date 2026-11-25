"use client";

import {useCallback,useState,type FormEvent} from "react";
import {api,contactSources,displayDate,errorMessage,type Organization} from "./data";
import {Empty,ErrorText,LoadError,Loading,useLoad} from "./components";

type Campaign={id:string;name:string;objective:string;source:string|null;message:string;createdAt:string;total:number;sent:number;pending:number;eligible:number;blocked:number};
type Recipient={id:string;contactName:string;phone:string;sentAt:string|null;state:"PENDING"|"SENT"|"BLOCKED"};
type Detail=Campaign & {recipients:Recipient[]};
type Report={from:string;to:string;sends:{day:string;count:number}[];followups:Record<string,number>;pending:number;blocked:number};
function localDate(value:Date, timezone = "America/Sao_Paulo"){return new Intl.DateTimeFormat("sv-SE",{timeZone:timezone}).format(value);}

export function Campaigns({organization,canManage}:{organization:Organization;canManage:boolean}){
  const isEn = organization.locale === "en-US";
  const root="/organizations/"+organization.id+"/campaigns";
  const load=useLoad(useCallback((signal:AbortSignal)=>api<Campaign[]>(root,"GET",undefined,signal),[root]));
  const [selected,setSelected]=useState("");
  const [name,setName]=useState("");
  const [objective,setObjective]=useState("");
  const [source,setSource]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [from,setFrom]=useState(()=>localDate(new Date(new Date().getFullYear(),new Date().getMonth(),1), organization.timezone));
  const [to,setTo]=useState(()=>localDate(new Date(), organization.timezone));
  const report=useLoad(useCallback((signal:AbortSignal)=>api<Report>(root+"/report?from="+from+"&to="+to,"GET",undefined,signal),[root,from,to]));
  const selectedCampaign=load.data?.find(c=>c.id===selected);
  async function generate(){
    setBusy(true);setError("");setNotice("");
    try{const result=await api<{message:string}>(root+"/draft","POST",{objective});setMessage(result.message);setNotice("Rascunho criado. Revise antes de salvar.");}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const campaign=await api<Campaign>(root,"POST",{name,objective,...(source&&{source}),message});
      setName("");setObjective("");setSource("");setMessage("");setSelected(campaign.id);setNotice("Campanha criada para "+campaign.total+" contatos autorizados.");load.reload();
    }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  return <div className="home-grid">
    <section className="panel"><div className="panel-heading"><div><h2>{isEn ? "Authorized campaigns" : "Campanhas autorizadas"}</h2><p>{isEn ? "Review each message and send manually to opted-in contacts." : "Revise cada mensagem e envie pelo WhatsApp da clínica."}</p></div></div>
      {canManage && <form className="form-stack" onSubmit={create}>
        <label className="form-field">{isEn ? "Campaign name" : "Nome da campanha"}<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={120} required/></label>
        <label className="form-field">{isEn ? "Objective" : "Objetivo"}<textarea value={objective} onChange={e=>setObjective(e.target.value)} minLength={5} maxLength={280} required/></label>
        <label className="form-field">{isEn ? "Contact source" : "Origem dos contatos"}<select value={source} onChange={e=>setSource(e.target.value)}><option value="">{isEn ? "All sources" : "Todas as origens"}</option>{Object.entries(contactSources).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <button type="button" className="button secondary" disabled={busy||objective.trim().length<5} onClick={generate}>Preparar texto com Gemini</button>
        <label className="form-field">Mensagem para revisar<textarea value={message} onChange={e=>setMessage(e.target.value)} minLength={10} maxLength={1200} required/></label>
        {error&&<ErrorText>{error}</ErrorText>}{notice&&<p role="status">{notice}</p>}
        <button className="button primary" disabled={busy||!message.trim()}>Criar campanha</button>
      </form>}
      {error&&!canManage&&<ErrorText>{error}</ErrorText>}
      <h3>Campanhas criadas</h3>
      {load.error?<LoadError message={load.error} retry={load.reload}/>:!load.data?<Loading/>:!load.data.length?<Empty>Nenhuma campanha criada.</Empty>:
        <div className="table-scroll"><table><thead><tr><th>Campanha</th><th>Enviadas</th><th>Elegíveis</th><th>Bloqueadas</th></tr></thead><tbody>{load.data.map(c=><tr key={c.id}>
          <td><button className="button ghost" aria-pressed={selected===c.id} onClick={()=>setSelected(c.id)}>{c.name}</button></td><td>{c.sent}</td><td>{c.eligible}</td><td>{c.blocked}</td>
        </tr>)}</tbody></table></div>}
    </section>
    <section className="panel"><h2>Acompanhamento</h2><p>Envios registrados e retornos da equipe no período selecionado.</p>
      <div className="date-tools"><label>De<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
      {report.error?<LoadError message={report.error} retry={report.reload}/>:!report.data?<Loading/>:
        <><p>Envios manuais registrados: {report.data.sends.reduce((n,r)=>n+r.count,0)}. Retornos pendentes: {report.data.pending}. Bloqueados por autorização ou número: {report.data.blocked}.</p>
        <h3>Envios por dia</h3>{report.data.sends.length?<ul>{report.data.sends.map(r=><li key={r.day}>{displayDate(r.day+"T12:00:00",organization.timezone,{dateStyle:"medium"},organization.locale)}: {r.count}</li>)}</ul>:<p>Nenhum envio registrado no período.</p>}
        <h3>Atividades de retorno</h3><ul><li>Contatos registrados: {report.data.followups["followup.contacted"]??0}</li><li>Acompanhamentos concluídos: {report.data.followups["followup.done"]??0}</li><li>Retornos remarcados: {report.data.followups["followup.reschedule"]??0}</li></ul></>}
    </section>
    {selectedCampaign&&<CampaignDetail key={selected} campaignId={selected} root={root} timezone={organization.timezone} locale={organization.locale ?? "pt-BR"} onChanged={()=>{load.reload();report.reload();}}/>}
  </div>;
}

function CampaignDetail({campaignId,root,timezone,locale,onChanged}:{campaignId:string;root:string;timezone:string;locale:string;onChanged:()=>void}){
  const path=root+"/"+campaignId;
  const load=useLoad(useCallback((signal:AbortSignal)=>api<Detail>(path,"GET",undefined,signal),[path]));
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  async function openWhatsapp(recipient:Recipient){
    const windowRef=window.open("about:blank","_blank");
    if(!windowRef){setError("Permita a abertura do WhatsApp para continuar.");return;}
    setBusy(recipient.id);setError("");
    try{
      const current=await api<{phone:string;message:string}>(path+"/recipients/"+recipient.id+"/prepare","POST",{});
      windowRef.location.href="https://wa.me/"+current.phone+"?text="+encodeURIComponent(current.message);
    }catch(e){windowRef.close();setError(errorMessage(e));load.reload();}
    finally{setBusy("");}
  }
  async function sent(recipient:Recipient){
    setBusy(recipient.id);setError("");
    try{await api(path+"/recipients/"+recipient.id+"/sent","POST",{});load.reload();onChanged();}
    catch(e){setError(errorMessage(e));load.reload();}
    finally{setBusy("");}
  }
  if(load.error)return <section className="panel"><LoadError message={load.error} retry={load.reload}/></section>;
  if(!load.data)return <section className="panel"><Loading/></section>;
  const campaign=load.data;
  return <section className="panel"><h2>{campaign.name}</h2><p>{campaign.objective}</p><label className="form-field">Texto revisado<textarea readOnly value={campaign.message}/></label>
    <p>{campaign.sent} enviadas · {campaign.eligible} elegíveis · {campaign.blocked} bloqueadas</p>
    {error&&<ErrorText>{error}</ErrorText>}
    {campaign.recipients.map(recipient=><article className="panel" key={recipient.id}><h3>{recipient.contactName}</h3>
      {recipient.state==="SENT"?<p>Envio registrado {recipient.sentAt&&displayDate(recipient.sentAt,timezone,{dateStyle:"short",timeStyle:"short"},locale)}.</p>:
        recipient.state==="BLOCKED"?<p>Envio bloqueado. A autorização foi revogada ou o número foi alterado.</p>:
          <><button className="button secondary" disabled={busy===recipient.id} onClick={()=>void openWhatsapp(recipient)}>Abrir WhatsApp da clínica</button>
            <button className="button primary" disabled={busy!==recipient.id} onClick={()=>void sent(recipient)}>Já enviei · registrar</button></>}
    </article>)}
  </section>;
}
