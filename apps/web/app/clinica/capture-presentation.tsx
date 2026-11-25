import type {ReactNode} from "react";

export const templates = {
  Geral: ["Solicitar contato","Deixe seu nome e um telefone ou e-mail para a equipe falar com você.","Solicitar retorno","#14665c"],
  Odontologia: ["Converse com a equipe de odontologia","Deixe seu contato para saber sobre avaliações e horários disponíveis.","Consultar horários","#265e75"],
  Psicologia: ["Converse sobre seu primeiro atendimento","Informe como prefere receber o retorno da nossa equipe.","Pedir contato","#644c72"],
  Fisioterapia: ["Agende uma avaliação de fisioterapia","Nossa equipe pode orientar você sobre a primeira avaliação e os horários.","Solicitar avaliação","#346248"],
} as const;
export type Presentation = {specialty:keyof typeof templates; title:string; description:string; button:string; color:string; logo:string};
export function template(specialty:Presentation["specialty"]):Presentation {
  const [title,description,button,color]=templates[specialty];
  return {specialty,title,description,button,color,logo:""};
}

export function CaptureContent({name,page,busy,children}:{name:string;page:Presentation;busy?:boolean;children?:ReactNode}) {
  const rgb=[1,3,5].map(i=>parseInt(page.color.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  const ink=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722>0.179?"#000":"#fff";
  return <div style={{borderTop:"5px solid "+page.color,paddingTop:18,overflowWrap:"anywhere"}}>
    {page.logo && /^https:\/\//i.test(page.logo) && <span role="img" aria-label={"Logo de "+name} style={{display:"block",width:110,height:58,backgroundImage:'url('+JSON.stringify(page.logo)+')',backgroundSize:"contain",backgroundPosition:"left center",backgroundRepeat:"no-repeat"}}/>}
    <p>{name}</p><h1>{page.title}</h1><p>{page.description}</p>
    <label className="form-field">Nome<input required name="name" autoComplete="name" minLength={2} maxLength={120}/></label>
    <label className="form-field">Telefone com DDD<input type="tel" name="phone" autoComplete="tel" maxLength={30}/></label>
    <label className="form-field">E-mail<input type="email" name="email" autoComplete="email" maxLength={254}/></label>
    <label><input type="checkbox" name="marketingConsent"/> Quero receber novidades e campanhas desta clínica pelo contato informado.</label>
    {children}<div><button className="button primary" style={{background:page.color,color:ink,marginTop:16}} disabled={busy}>{busy?"Enviando…":page.button}</button></div>
  </div>;
}
