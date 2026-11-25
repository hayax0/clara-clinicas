import {Body, ConflictException, Controller, Get, Param, Post, Req} from '@nestjs/common';
import type {Request} from 'express';
import {z} from 'zod';
import {Database} from './database.js';
import type {Prisma} from './generated/prisma/client.js';
import {Access} from './organizations.js';
import {id,parse} from './validation.js';

export function listFollowUps(tx:Prisma.TransactionClient, org:string, timezone:string) {
  return tx.$queryRaw<{id:string;name:string;followUpAt:Date;bucket:'overdue'|'today'|'upcoming'}[]>`
    SELECT id,name,"followUpAt",CASE
      WHEN ("followUpAt" AT TIME ZONE ${timezone})::date < (now() AT TIME ZONE ${timezone})::date THEN 'overdue'
      WHEN ("followUpAt" AT TIME ZONE ${timezone})::date = (now() AT TIME ZONE ${timezone})::date THEN 'today'
      ELSE 'upcoming' END AS bucket FROM "Contact" WHERE "organizationId"=${org}::uuid
      AND "leadStatus" <> 'DONE' AND "followUpAt" IS NOT NULL ORDER BY "followUpAt",name,id`;
}
const instant=z.iso.datetime({offset:true});
const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('reschedule'),expected:instant,next:instant}),
  z.object({action:z.literal('contacted'),expected:instant}),
  z.object({action:z.literal('done'),expected:instant}),
]);
export async function changeFollowUp(tx:Prisma.TransactionClient,org:string,actorId:string,contactId:string,input:z.infer<typeof command>) {
  if(input.action==='reschedule' && Date.parse(input.next)<=Date.now()) throw new ConflictException('Escolha um horário futuro.');
  const data=input.action==='reschedule' ? {leadStatus:'WAITING',followUpAt:new Date(input.next)}
    : {leadStatus:input.action==='done'?'DONE':'CONTACTED',followUpAt:null};
  const result=await tx.contact.updateMany({where:{id:contactId,organizationId:org,leadStatus:{not:'DONE'},followUpAt:new Date(input.expected)},data});
  if(!result.count) throw new ConflictException('Esse retorno mudou. Consulte a fila atualizada.');
  await tx.auditEvent.create({data:{organizationId:org,actorId,resourceId:contactId,action:'followup.'+input.action}});
}

@Controller('organizations/:orgId/follow-ups')
export class FollowUpsController {
  constructor(private readonly db:Database,private readonly access:Access){}
  @Get()
  async list(@Param('orgId') org:string,@Req() req:Request){
    const {organization}=await this.access.clinic(req,org);
    return listFollowUps(this.db,org,organization.timezone);
  }
  @Post(':contactId')
  async change(@Param('orgId') org:string,@Param('contactId') key:string,@Body() body:unknown,@Req() req:Request){
    const {user}=await this.access.clinic(req,org,['OWNER','MANAGER','STAFF']);
    await this.db.$transaction(tx=>changeFollowUp(tx,org,user.id,parse(id,key),parse(command,body)));
    return {ok:true};
  }
}
