import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Access } from './organizations.js';
import { Auth } from './auth.js';
import { Database } from './database.js';
import { email, id, name, parse } from './validation.js';

const input = z.strictObject({
  marketingConsent: z.boolean().default(false), requestId: id, name, email: email.optional(),
  phone: z.string().trim().max(30).regex(/^\+?[\d ()-]+$/).transform(v=>v.replace(/\D/g,'')).pipe(z.string().min(8).max(15)).optional(),
  source: z.enum(['WEBSITE','INSTAGRAM','GOOGLE','WHATSAPP','REFERRAL','OTHER']).default('WEBSITE'),
}).refine(data=>data.phone || data.email, 'Informe um telefone ou e-mail para retorno.');

@Controller('public/capture/:clinicId')
export class CaptureController {
  constructor(private readonly db: Database, private readonly auth: Auth) {}

  @Get()
  async details(@Param('clinicId') clinicId: string) {
    const clinic = await this.db.organization.findFirst({where:{id:parse(id,clinicId),status:'ACTIVE'},select:{name:true,capturePage:true}});
    if (!clinic) throw new NotFoundException('Formulário indisponível.');
    return clinic;
  }

  @Post()
  async submit(@Param('clinicId') clinicId:string,@Body() body:unknown,@Req() request:Request) {
    this.auth.throttle(request,'public-capture',40);
    const organizationId = parse(id,clinicId);
    const {requestId,marketingConsent,...contact} = parse(input,body);
    return this.db.$transaction(async tx=>{
      const active=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Organization" WHERE id=${organizationId}::uuid AND status='ACTIVE' FOR SHARE`;
      if (!active.length) throw new NotFoundException('Formulário indisponível.');
      await tx.contact.createMany({data:{id:randomUUID(),organizationId,captureRequestId:requestId,marketingConsentAt:marketingConsent ? new Date() : null,...contact},skipDuplicates:true});
      return {received:true};
    });
  }
}

const presentation = z.strictObject({
  specialty: z.enum(['Geral','Odontologia','Psicologia','Fisioterapia']),
  title: z.string().trim().min(2).max(90),
  description: z.string().trim().min(2).max(400),
  button: z.string().trim().min(2).max(50),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  logo: z.union([z.literal(''), z.url({protocol:/^https$/}).max(2000)]),
});

@Controller('organizations/:orgId')
export class CaptureSettingsController {
  constructor(private readonly db:Database, private readonly access:Access) {}

  @Post('capture-page/publish')
  async publish(@Param('orgId') organizationId:string,@Req() request:Request,@Body() body:unknown) {
    const {user} = await this.access.clinic(request,organizationId,['OWNER','MANAGER']);
    const page=parse(presentation,body);
    await this.db.$transaction([
      this.db.organization.update({where:{id:organizationId},data:{capturePage:page}}),
      this.db.auditEvent.create({data:{organizationId,actorId:user.id,action:'capture.published',resourceId:organizationId}}),
    ]);
    return page;
  }

  @Post('contacts/:contactId/revoke-marketing')
  async revoke(@Param('orgId') organizationId:string,@Param('contactId') key:string,@Req() request:Request) {
    const {user}=await this.access.clinic(request,organizationId,['OWNER','MANAGER','STAFF']);
    const contactId=parse(id,key);
    await this.db.$transaction(async tx=>{
      const changed=await tx.contact.updateMany({where:{id:contactId,organizationId,marketingConsentAt:{not:null},marketingRevokedAt:null},data:{marketingRevokedAt:new Date()}});
      if(changed.count) await tx.auditEvent.create({data:{organizationId,actorId:user.id,action:'contact.marketing.revoked',resourceId:contactId}});
    });
    return {ok:true};
  }
}
