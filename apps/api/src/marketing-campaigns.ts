import {
  BadGatewayException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { geminiMaxAttempts, MODEL_PROVIDER, type GeminiProvider } from './ai/gemini-provider.js';
import { AiUsage } from './ai/usage.js';
import { Database } from './database.js';
import { Access } from './organizations.js';
import { id, name, parse } from './validation.js';

const sources = z.enum(['REFERRAL','INSTAGRAM','GOOGLE','WHATSAPP','WEBSITE','OTHER']);
const draftInput = z.strictObject({ objective: z.string().trim().min(5).max(280) });
const campaignInput = z.strictObject({
  name, objective: z.string().trim().min(5).max(280), source: sources.optional(),
  message: z.string().trim().min(10).max(1200),
});
const roles = ['OWNER','MANAGER','STAFF'] as const;

@Controller('organizations/:orgId/campaigns')
export class MarketingCampaignController {
  constructor(private readonly db: Database, private readonly access: Access, private readonly usage: AiUsage,
    @Inject(MODEL_PROVIDER) private readonly model: GeminiProvider) {}

  @Post('draft')
  async draft(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user, organization } = await this.access.clinic(req, orgId, ['OWNER','MANAGER']);
    const { objective } = parse(draftInput, body);
    if (!this.model.standardAvailable) throw new ServiceUnavailableException('Configure o Gemini para preparar a mensagem.');
    const reservation = await this.usage.reserve({ organizationId: orgId, actorId: user.id, agentId: 'crm',
      estimatedTokens: 512 * geminiMaxAttempts, estimatedCalls: geminiMaxAttempts });
    let completion: Parameters<AiUsage['finish']>[1] = { status: 'FAILED' };
    try {
      const result = await this.model.generate({
        tier: 'standard',
        instructions: 'Redija uma mensagem de campanha curta e respeitosa em português brasileiro. A pessoa autorizou receber campanhas. Não use nome, telefone ou outros dados de contatos. Não invente preço, desconto, disponibilidade, procedimento, resultado clínico, urgência nem promessa. Evite linguagem médica e pressão. Use a clínica e o objetivo informados. Termine oferecendo a opção de não receber novas mensagens. Até 450 caracteres.',
        turns: [{ role: 'user', text: 'Clínica: ' + organization.name + '. Objetivo informado pela equipe: ' + objective + '.' }],
        tools: [], maxOutputTokens: 384, timeoutMs: 12_000,
      });
      if (result.status !== 'unavailable') completion.usage = result.usage;
      if (result.status === 'unavailable') throw new ServiceUnavailableException('O Gemini está indisponível.');
      if (result.status === 'failed' || result.output.kind !== 'text') throw new BadGatewayException('Não consegui preparar o texto da campanha.');
      const message = result.output.text.trim();
      if (message.length < 10 || message.length > 1200) throw new BadGatewayException('Revise o texto preparado e tente novamente.');
      completion = { ...completion, status: 'COMPLETED', tool: 'campaign_copy' };
      await this.db.auditEvent.create({ data: { organizationId: orgId, actorId: user.id, action: 'campaign.copy.generated' } });
      return { message };
    } finally {
      await this.usage.finish(reservation.id, completion);
    }
  }

  @Post()
  async create(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, ['OWNER','MANAGER']);
    const input = parse(campaignInput, body);
    return this.db.$transaction(async tx => {
      const contacts = await tx.contact.findMany({
        where: { organizationId: orgId, marketingConsentAt: { not: null }, marketingRevokedAt: null,
          phone: { not: null }, ...(input.source && { source: input.source }) },
        select: { id: true, name: true, phone: true }, take: 5001,
      });
      if (contacts.length > 5000) throw new ConflictException('Limite de 5.000 contatos por campanha. Selecione uma origem.');
      if (!contacts.length) throw new ConflictException('Não há contatos com autorização vigente, telefone e origem selecionada.');
      const campaign = await tx.marketingCampaign.create({
        data: { organizationId: orgId, createdById: user.id, ...input,
          recipients: { createMany: { data: contacts.map(contact => ({ contactId: contact.id, contactName: contact.name, phone: contact.phone! })) } } },
        select: { id: true, name: true, objective: true, source: true, message: true, createdAt: true },
      });
      await tx.auditEvent.create({ data: { organizationId: orgId, actorId: user.id, action: 'campaign.created', resourceId: campaign.id } });
      return { ...campaign, total: contacts.length };
    });
  }

  @Get()
  async list(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, [...roles]);
    const campaigns = await this.db.marketingCampaign.findMany({ where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' }, take: 50 });
    if (!campaigns.length) return [];
    const summaries = await this.db.$queryRawUnsafe<Array<{ campaignId: string; total: number; sent: number; pending: number; blocked: number }>>(
      'SELECT m.id AS "campaignId", count(r.id)::int AS total, count(r.id) FILTER (WHERE r.status=\'SENT\')::int AS sent, ' +
      'count(r.id) FILTER (WHERE r.status=\'PENDING\')::int AS pending, ' +
      'count(r.id) FILTER (WHERE r.status=\'PENDING\' AND (x."marketingConsentAt" IS NULL OR x."marketingRevokedAt" IS NOT NULL OR x.phone IS DISTINCT FROM r.phone))::int AS blocked ' +
      'FROM "MarketingCampaign" m LEFT JOIN "MarketingCampaignRecipient" r ON r."campaignId"=m.id ' +
      'LEFT JOIN "Contact" x ON x.id=r."contactId" AND x."organizationId"=m."organizationId" ' +
      'WHERE m."organizationId"=$1::uuid GROUP BY m.id', orgId);
    const counts = new Map(summaries.map(row => [row.campaignId, row]));
    return campaigns.map(campaign => ({ ...campaign, ...(counts.get(campaign.id) ?? { total: 0, sent: 0, pending: 0, blocked: 0 }),
      eligible: (counts.get(campaign.id)?.pending ?? 0) - (counts.get(campaign.id)?.blocked ?? 0) }));
  }

  @Get('report')
  async report(@Param('orgId') orgId: string, @Req() req: Request, @Query() query: Record<string, string>) {
    const { organization } = await this.access.clinic(req, orgId, [...roles]);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: organization.timezone }).format(new Date());
    const from = query.from ?? today.slice(0, 8) + '01';
    const to = query.to ?? today;
    const dates = parse(z.strictObject({ from: z.iso.date(), to: z.iso.date() }).refine(v => v.from <= v.to
      && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000), { from, to });
    const [sends, followups, recipients] = await Promise.all([
      this.db.$queryRawUnsafe<Array<{ day: string; count: number }>>(
        'SELECT to_char(date_trunc(\'day\',r."sentAt" AT TIME ZONE $3),\'YYYY-MM-DD\') AS day,count(*)::int AS count ' +
        'FROM "MarketingCampaignRecipient" r JOIN "MarketingCampaign" c ON c.id=r."campaignId" ' +
        'WHERE c."organizationId"=$1::uuid AND r."sentAt">=($2::date::timestamp AT TIME ZONE $3) ' +
        'AND r."sentAt"<(($4::date+1)::timestamp AT TIME ZONE $3) GROUP BY 1 ORDER BY 1', orgId, dates.from, organization.timezone, dates.to),
      this.db.$queryRawUnsafe<Array<{ action: string; count: number }>>(
        'SELECT "action",count(*)::int AS count FROM "AuditEvent" WHERE "organizationId"=$1::uuid ' +
        'AND "action" IN (\'followup.contacted\',\'followup.done\',\'followup.reschedule\') ' +
        'AND "createdAt">=($2::date::timestamp AT TIME ZONE $3) AND "createdAt"<(($4::date+1)::timestamp AT TIME ZONE $3) ' +
        'GROUP BY "action" ORDER BY "action"', orgId, dates.from, organization.timezone, dates.to),
      this.db.$queryRawUnsafe<Array<{ pending: number; blocked: number }>>(
        'SELECT count(*) FILTER(WHERE r.status=\'PENDING\')::int AS pending, ' +
        'count(*) FILTER(WHERE r.status=\'PENDING\' AND (x."marketingConsentAt" IS NULL OR x."marketingRevokedAt" IS NOT NULL OR x.phone IS DISTINCT FROM r.phone))::int AS blocked ' +
        'FROM "MarketingCampaignRecipient" r JOIN "MarketingCampaign" m ON m.id=r."campaignId" ' +
        'LEFT JOIN "Contact" x ON x.id=r."contactId" AND x."organizationId"=m."organizationId" WHERE m."organizationId"=$1::uuid', orgId),
    ]);
    return { from: dates.from, to: dates.to, sends, followups: Object.fromEntries(followups.map(row => [row.action, row.count])),
      pending: recipients[0]?.pending ?? 0, blocked: recipients[0]?.blocked ?? 0 };
  }

  @Get(':campaignId')
  async detail(@Param('orgId') orgId: string, @Param('campaignId') key: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, [...roles]);
    const campaign = await this.db.marketingCampaign.findFirst({ where: { id: parse(id, key), organizationId: orgId } });
    if (!campaign) throw new NotFoundException('Campanha indisponível.');
    const recipients = await this.db.marketingCampaignRecipient.findMany({ where: { campaignId: campaign.id },
      orderBy: { contactName: 'asc' }, take: 1000 });
    const contacts = await this.db.contact.findMany({ where: { organizationId: orgId, id: { in: recipients.map(row => row.contactId) } },
      select: { id: true, marketingConsentAt: true, marketingRevokedAt: true, phone: true } });
    const current = new Map(contacts.map(contact => [contact.id, contact]));
    return { ...campaign, recipients: recipients.map(row => {
      const contact = current.get(row.contactId);
      const eligible = !!contact?.marketingConsentAt && !contact.marketingRevokedAt && contact.phone === row.phone;
      return { ...row, eligible, state: row.status === 'SENT' ? 'SENT' : eligible ? 'PENDING' : 'BLOCKED' };
    }) };
  }

  @Post(':campaignId/recipients/:recipientId/prepare')
  async prepare(@Param('orgId') orgId: string, @Param('campaignId') campaignKey: string,
    @Param('recipientId') recipientKey: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, [...roles]);
    const campaignId = parse(id, campaignKey);
    const recipientId = parse(id, recipientKey);
    return this.db.$transaction(async tx => {
      const [row] = await tx.$queryRawUnsafe<Array<{phone:string;message:string;status:string;consent:Date|null;revoked:Date|null;currentPhone:string|null}>>(
        'SELECT r.phone,m.message,r.status,x."marketingConsentAt" AS consent,x."marketingRevokedAt" AS revoked,x.phone AS "currentPhone" ' +
        'FROM "MarketingCampaignRecipient" r JOIN "MarketingCampaign" m ON m.id=r."campaignId" ' +
        'JOIN "Contact" x ON x.id=r."contactId" AND x."organizationId"=m."organizationId" ' +
        'WHERE m."organizationId"=$1::uuid AND m.id=$2::uuid AND r.id=$3::uuid FOR UPDATE OF x,r', orgId, campaignId, recipientId);
      if(!row || row.status!=='PENDING' || !row.consent || row.revoked || row.currentPhone!==row.phone)
        throw new ConflictException('O contato não tem autorização vigente ou mudou de número.');
      return {phone:row.phone,message:row.message};
    });
  }

  @Post(':campaignId/recipients/:recipientId/sent')
  async markSent(@Param('orgId') orgId: string, @Param('campaignId') campaignKey: string, @Param('recipientId') recipientKey: string,
    @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, [...roles]);
    const campaignId = parse(id, campaignKey);
    const recipientId = parse(id, recipientKey);
    return this.db.$transaction(async tx => {
      const [row] = await tx.$queryRawUnsafe<Array<{ contactId: string; phone: string; status: string }>>(
        'SELECT r."contactId",r.phone,r.status FROM "MarketingCampaignRecipient" r ' +
        'JOIN "MarketingCampaign" m ON m.id=r."campaignId" ' +
        'JOIN "Contact" x ON x.id=r."contactId" AND x."organizationId"=m."organizationId" ' +
        'WHERE m."organizationId"=$1::uuid AND m.id=$2::uuid AND r.id=$3::uuid FOR UPDATE OF x,r', orgId, campaignId, recipientId);
      if (!row || row.status !== 'PENDING') throw new ConflictException('Envio indisponível ou já registrado.');
      const [contact] = await tx.$queryRawUnsafe<Array<{ id: string; phone: string | null; consent: Date | null; revoked: Date | null }>>(
        'SELECT id,phone,"marketingConsentAt" AS consent,"marketingRevokedAt" AS revoked FROM "Contact" WHERE id=$1::uuid AND "organizationId"=$2::uuid',
        row.contactId, orgId);
      if (!contact?.consent || contact.revoked || contact.phone !== row.phone) throw new ConflictException('O contato não tem autorização vigente ou mudou de número.');
      const sentAt = new Date();
      const result = await tx.marketingCampaignRecipient.updateMany({ where: { id: recipientId, campaignId, status: 'PENDING' },
        data: { status: 'SENT', sentAt, sentById: user.id } });
      if (!result.count) throw new ConflictException('Este envio já foi registrado.');
      await tx.auditEvent.create({ data: { organizationId: orgId, actorId: user.id, resourceId: recipientId, action: 'campaign.recipient.sent' } });
      return { sentAt };
    });
  }
}
