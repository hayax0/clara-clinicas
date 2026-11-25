import {z} from 'zod';
import type {Database} from '../database.js';
import {changeFollowUp,listFollowUps} from '../follow-ups.js';
import {dateParts} from './chat-date.js';
import {lockChatAccess} from './assistant-actions.js';

const clean=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const draftSchema=z.object({id:z.uuid(),expected:z.iso.datetime(),next:z.iso.datetime(),name:z.string()});
export async function followUpChat(db:Database,scope:{organizationId:string;actorId:string;agentId:string},turnId:string,message:string,timezone:string,locale='pt-BR'){
  if(!['main','crm'].includes(scope.agentId)) return;
  const msg=clean(message);
  const confirm=/^(?:confirmar|confirmo|confirme)(?: o)? retorno[.!]?$/.test(msg)
    || /^(?:confirm|confirmar)(?: the)? follow.?up[.!]?$/.test(msg)
    || /^(?:confirmar|confirme)(?: el)? seguimiento[.!]?$/.test(msg);
  const cancel=/^(?:cancelar|cancele)(?: o)? retorno[.!]?$/.test(msg)
    || /^cancel(?: the)? follow.?up[.!]?$/.test(msg)
    || /^cancelar(?: el)? seguimiento[.!]?$/.test(msg);
  const reschedule=/\b(remarque|remarcar|reagende|reagendar|adie|adiar|mude|mudar|reschedule|postpone|move|reprograme|reprogramar|posponga|aplazar|cambiar)\b/.test(msg);
  const mentionsQueue=/\b(retornos?|follow.?ups?|seguimientos?)\b/.test(msg);
  if(!confirm && !cancel && !(mentionsQueue && (reschedule || /\b(quem|quais|fila|liste|listar|mostre|ver|pendentes|atrasados|who|which|list|show|pending|overdue|quien|cuales|lista|muestre|pendientes|atrasados)\b/.test(msg) || /^(?:retornos?|follow.?ups?|seguimientos?)\b/.test(msg))) && !/(?:com quem|who do i|con quien) (?:eu )?preciso falar/.test(msg)) return;
  // Consultations about clinical return appointments belong to Agenda.
  if(/\b(consulta|consultas|paciente|agenda medica|appointment|appointments|cita|citas|patient)\b/.test(msg)) return;
  return db.$transaction(async tx=>{
    await lockChatAccess(tx,scope);
    const reply=(answer:string,tool='followup_list',draft?:z.infer<typeof draftSchema>)=>tx.assistantTurn.update({where:{id:turnId},data:{
      answer,tool,responderId:'crm',metrics:[],...(draft && {actionDraft:draft,proposalExpiresAt:new Date(Date.now()+900000)})},
      select:{id:true,userText:true,answer:true,responderId:true,metrics:true,createdAt:true,tool:true,proposalExpiresAt:true}});
    const isEn=locale==='en-US', isEs=locale==='es-ES', isPtPt=locale==='pt-PT';
    const format=(date:Date)=>date.toLocaleString(locale,{timeZone:timezone,dateStyle:'short',timeStyle:'short'});
    const org=scope.organizationId;
    const pending={...scope,tool:'followup_proposal',proposalExpiresAt:{gt:new Date()}};
    if(confirm || cancel){
      const prior=await tx.assistantTurn.findFirst({where:pending,orderBy:{createdAt:'desc'}});
      if(!prior) return reply(isEn?'I could not find a pending reschedule in this conversation.':isEs?'No he encontrado ningún cambio de cita pendiente en esta conversación.':isPtPt?'Não encontrei nenhuma remarcação pendente nesta conversa.':'Não encontrei uma remarcação pendente nesta conversa.');
      const draft=draftSchema.parse(prior.actionDraft);
      await tx.assistantTurn.update({where:{id:prior.id},data:{proposalExpiresAt:null}});
      if(cancel) return reply(isEn?'I discarded the reschedule.':isEs?'He descartado el cambio de cita.':isPtPt?'Descartei a remarcação.':'Descartei a remarcação.');
      await changeFollowUp(tx,org,scope.actorId,draft.id,{action:'reschedule',expected:draft.expected,next:draft.next});
      return reply(isEn?'I rescheduled '+draft.name+' for '+format(new Date(draft.next))+'.':isEs?'He cambiado la cita de '+draft.name+' al '+format(new Date(draft.next))+'.':isPtPt?'Remarquei o retorno de '+draft.name+' para '+format(new Date(draft.next))+'.':'Remarquei o retorno de '+draft.name+' para '+format(new Date(draft.next))+'.','followup_changed');
    }
    const rows=await listFollowUps(tx,org,timezone);
    if(!reschedule){
      const due=rows.filter(r=>/proximos|futuros|upcoming|next|siguientes|proximos/.test(msg)?r.bucket==='upcoming':/atrasados|overdue|vencidos/.test(msg)?r.bucket==='overdue':r.bucket!=='upcoming');
      if(!due.length) return reply(isEn?'There are no follow-ups pending for that period.':isEs?'No hay seguimientos pendientes para ese periodo.':isPtPt?'Não há retornos pendentes nesse período.':'Nenhum retorno pendente nesse período.');
      const rowsText=due.slice(0,12).map(r=>r.name+' — '+format(r.followUpAt)+(r.bucket==='overdue'?(isEn?' (overdue)':isEs?' (atrasado)':' (atrasado)'):'')).join('\n');
      return reply(rowsText+(due.length>12?(isEn?'\nSee the rest in Inbox → Follow-ups.':isEs?'\nConsulte los demás en Atención → Seguimientos.':'\nVeja os demais em Atendimento → Retornos.') :''));
    }
    await tx.assistantTurn.updateMany({where:pending,data:{proposalExpiresAt:null}});
    const matches=rows.filter(r=>(' '+msg.replace(/[,.:;!?]/g,' ')+' ').includes(' '+clean(r.name)+' '));
    if(matches.length!==1) return reply(isEn?'I need to identify one contact. Use the full name from the queue or choose the follow-up in Inbox → Follow-ups.':isEs?'Necesito identificar a un único contacto. Use el nombre completo de la lista o seleccione el seguimiento en Atención → Seguimientos.':isPtPt?'Preciso de identificar um único contacto. Use o nome completo da fila ou selecione o retorno em Atendimento → Retornos.':'Preciso identificar um único contato. Use o nome completo da fila ou selecione o retorno em Atendimento → Retornos.');
    const row=matches[0];
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone}).format(new Date());
    const parts=dateParts(message,today,locale);
    if(parts.invalidDate || (!parts.day && parts.relative===undefined)) return reply(isEn?'Tell me the name and new date, for example: “reschedule '+row.name+"'s follow-up for tomorrow at 2pm.”":isEs?'Indique el nombre y la nueva fecha. Por ejemplo: «cambie el seguimiento de '+row.name+' para mañana a las 14».':isPtPt?'Indique o nome e a nova data. Por exemplo: «remarque o retorno de '+row.name+' para amanhã às 14h».':'Informe o nome e a nova data. Por exemplo, “remarque o retorno de '+row.name+' para amanhã às 14h”.');
    const time=parts.time ?? row.followUpAt.toLocaleTimeString(locale,{timeZone:timezone,hour:'2-digit',minute:'2-digit'});
    const [slot]=await tx.$queryRaw<{next:Date}[]>`SELECT (coalesce(${parts.day ?? null}::date,(now() AT TIME ZONE ${timezone})::date + ${parts.relative ?? 0}::int) + ${time}::time) AT TIME ZONE ${timezone} AS next`;
    if(+slot.next<=Date.now()) return reply(isEn?'That time has passed. Give me a future date.':isEs?'Esa hora ya ha pasado. Indique una fecha futura.':isPtPt?'Essa hora já passou. Indique uma data futura.':'Esse horário já passou. Informe o nome e uma data futura.');
    return reply(isEn?'Reschedule '+row.name+"'s follow-up for "+format(slot.next)+'? Say “Confirm follow-up” to save.':isEs?'¿Cambio el seguimiento de '+row.name+' al '+format(slot.next)+'? Diga «Confirmar seguimiento» para guardar.':isPtPt?'Remarcar o retorno de '+row.name+' para '+format(slot.next)+'? Diga «Confirmar retorno» para guardar.':'Remarcar o retorno de '+row.name+' para '+format(slot.next)+'? Diga “Confirmar retorno” para salvar.','followup_proposal',
      {id:row.id,name:row.name,expected:row.followUpAt.toISOString(),next:slot.next.toISOString()});
  });
}
