"use client";
import {useCallback,useState} from "react";
import {api,errorMessage,type Organization} from "./data";
import {CaptureContent,template,templates,type Presentation} from "./capture-presentation";
import {ErrorText,LoadError,Loading,useLoad} from "./components";

export function CaptureEditor({organization,canPublish}:{organization:Organization;canPublish:boolean}) {
  const load=useLoad(useCallback((signal:AbortSignal)=>api<{capturePage:Presentation|null}>("/public/capture/"+organization.id,"GET",undefined,signal),[organization.id]));
  const [draft,edit]=useState<Presentation>();
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const page=draft ?? load.data?.capturePage ?? template("Geral");
  function change(next:Presentation){edit(next);setNotice("");setError("");}
  if(load.error)return <LoadError message={load.error} retry={load.reload}/>;
  if(!load.data)return <Loading/>;
  return <section className="panel"><h2>Personalizar página</h2><form className="form-stack" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError("");
    try {await api('/organizations/'+organization.id+'/capture-page/publish','POST',page);setNotice("Página publicada no link atual da clínica.");}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }}>
    <label className="form-field">Modelo por especialidade<select value={page.specialty} onChange={e=>change({...template(e.target.value as Presentation["specialty"]),logo:page.logo})}>{Object.keys(templates).map(k=><option key={k}>{k}</option>)}</select></label>
    <label className="form-field">Logo (endereço HTTPS da imagem)<input type="url" maxLength={2000} pattern="https://.*" value={page.logo} onChange={e=>change({...page,logo:e.target.value})}/></label>
    <label className="form-field">Cor da página<input type="color" value={page.color} onChange={e=>change({...page,color:e.target.value})}/></label>
    <label className="form-field">Título<input required minLength={2} maxLength={90} value={page.title} onChange={e=>change({...page,title:e.target.value})}/></label>
    <label className="form-field">Apresentação<textarea required minLength={2} maxLength={400} value={page.description} onChange={e=>change({...page,description:e.target.value})}/></label>
    <label className="form-field">Texto do botão<input required minLength={2} maxLength={50} value={page.button} onChange={e=>change({...page,button:e.target.value})}/></label>
    <h3>Prévia no celular</h3><fieldset disabled style={{maxWidth:390,width:"100%",boxSizing:"border-box",margin:0,borderRadius:16,padding:16}}><CaptureContent name={organization.name} page={page}/></fieldset>
    {canPublish ? <button className="button primary" disabled={busy}>Publicar página</button> : <p>A publicação é feita por um gestor ou proprietário.</p>}
    {error && <ErrorText>{error}</ErrorText>}{notice && <p role="status">{notice}</p>}
  </form></section>;
}
