import { ConflictException, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Database } from './database.js';
import { Access } from './organizations.js';
import { id, parse } from './validation.js';

function eligible(organizationId:string) {
  const now=new Date();
  return {organizationId,status:'SCHEDULED' as const,reminderPhone:{not:null},startAt:{gt:now,lte:new Date(+now+86400000)}};
}
const writers=['OWNER','MANAGER','STAFF'] as const;

@Controller('organizations/:orgId/reminders')
export class ReminderController {
  constructor(private readonly db:Database,private readonly access:Access) {}

  @Get('queue')
  async queue(@Param('orgId') org:string,@Req() req:Request) {
    await this.access.clinic(req,org,[...writers]);
    const appointments=await this.db.appointment.findMany({where:eligible(org),orderBy:{startAt:'asc'},
      select:{id:true,patientId:true,startAt:true,reminderPhone:true,patient:{select:{name:true}},reminders:{select:{startAt:true,patientId:true,peer:true,state:true}}}});
    return appointments.filter(a=>!a.reminders.some(r=>+r.startAt===+a.startAt && r.patientId===a.patientId && r.peer===a.reminderPhone && ['manual_sent','accepted'].includes(r.state)))
      .map(a=>({id:a.id,name:a.patient.name,startAt:a.startAt}));
  }

  @Post(':id/draft')
  async draft(@Param('orgId') org:string,@Param('id') key:string,@Req() req:Request) {
    const {organization}=await this.access.clinic(req,org,[...writers]);
    const where={...eligible(org),id:parse(id,key)};
    const appointment=await this.db.appointment.findFirst({where});
    if (!appointment) throw new ConflictException('A consulta já não está disponível para lembrete.');
    const locale=organization.locale ?? 'pt-BR';
    const copy=locale==='en-US'
      ? {opening:'Hello! This is a reminder about your appointment.',source:'Clinic template',body:(when:string)=>` Your appointment is scheduled for ${when}. Please confirm your attendance or let us know if you would like to reschedule.`}
      : locale==='es-ES'
        ? {opening:'Hola. Le recordamos su cita.',source:'Plantilla de la clínica',body:(when:string)=>` Su cita es el ${when}. ¿Puede confirmar su asistencia o prefiere cambiarla?`}
        : locale==='pt-PT'
          ? {opening:'Olá! Estamos a recordar-lhe a sua consulta.',source:'Modelo da clínica',body:(when:string)=>` A sua consulta está marcada para ${when}. Pode confirmar a sua presença ou prefere remarcar?`}
          : {opening:'Olá! Estamos passando para lembrar da sua consulta.',source:'Modelo da clínica',body:(when:string)=>` Seu horário é ${when}. Pode confirmar sua presença ou prefere remarcar?`};
    const current=await this.db.appointment.findFirst({where:{...where,startAt:appointment.startAt,reminderPhone:appointment.reminderPhone,patientId:appointment.patientId}});
    if (!current) throw new ConflictException('A consulta mudou. Atualize a fila.');
    const when=current.startAt.toLocaleString(locale,{timeZone:organization.timezone,dateStyle:'short',timeStyle:'short'});
    return {phone:current.reminderPhone,patientId:current.patientId,startAt:current.startAt,source:copy.source,text:copy.opening+copy.body(when)};
  }

  @Post(':id/sent')
  async sent(@Param('orgId') org:string,@Param('id') key:string,@Req() req:Request) {
    const {user}=await this.access.clinic(req,org,[...writers]);
    const a=await this.db.appointment.findFirst({where:{...eligible(org),id:parse(id,key)}});
    if (!a?.reminderPhone || a.startAt.toISOString()!==req.body?.startAt || a.reminderPhone!==req.body?.phone || a.patientId!==req.body?.patientId)
      throw new ConflictException('A consulta mudou. Atualize a fila.');
    const data={appointmentId:a.id,patientId:a.patientId,startAt:a.startAt,peer:a.reminderPhone};
    await this.db.$transaction(async tx=>{
      await tx.appointmentReminder.upsert({where:{appointmentId_patientId_startAt_peer:data},create:{...data,state:'manual_sent',phoneId:'manual'},update:{state:'manual_sent'}});
      await tx.auditEvent.create({data:{actorId:user.id,organizationId:org,action:'reminder.manual_sent',resourceId:a.id}});
    });
    return {ok:true};
  }
}
