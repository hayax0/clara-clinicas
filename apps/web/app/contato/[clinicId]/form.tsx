"use client";

import {useCallback,useRef,useState,type FormEvent} from "react";
import {CaptureContent,template,type Presentation} from "../../clinica/capture-presentation";
import {api,contactSources,errorMessage} from "../../clinica/data";
import {ErrorText,LoadError,Loading,useLoad} from "../../clinica/components";

export function CaptureForm({clinicId,origin}:{clinicId:string;origin?:string}) {
  const path='/public/capture/'+encodeURIComponent(clinicId);
  const clinic=useLoad(useCallback((signal:AbortSignal)=>api<{name:string;capturePage:Presentation|null}>(path,"GET",undefined,signal),[path]));
  const key=useRef("");
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const email=String(data.get("email") ?? "").trim();
    const phone=String(data.get("phone") ?? "").trim();
    if (!email && !phone) {setError("Informe um telefone ou e-mail para a equipe responder.");return;}
    setBusy(true);setError("");
    try {
      key.current ||= crypto.randomUUID();
      await api(path,"POST",{requestId:key.current,marketingConsent:data.has("marketingConsent"),name:data.get("name"),email:email || undefined,phone:phone || undefined,
        source:origin && Object.hasOwn(contactSources,origin) ? origin : "WEBSITE"});
      setSent(true);
    } catch(err){setError(errorMessage(err));} finally{setBusy(false);}
  }
  return <main style={{maxWidth:560,margin:"8vh auto",padding:"0 1rem"}}><section className="panel">
    {clinic.error ? <LoadError message={clinic.error} retry={clinic.reload}/> : !clinic.data ? <Loading/> :
      sent ? <div role="status"><p>{clinic.data.name}</p><h1>Pedido recebido</h1><p>A equipe recebeu seus dados para retornar o contato.</p></div> :
        <form className="form-stack" onSubmit={submit}><CaptureContent name={clinic.data.name} page={clinic.data.capturePage ?? template("Geral")} busy={busy}>
          {error && <ErrorText>{error}</ErrorText>}
        </CaptureContent></form>}
  </section></main>;
}
