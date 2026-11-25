import { randomBytes } from 'node:crypto';
import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Patch, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, hashPassword } from './auth.js';
import { Database } from './database.js';
import { demoEmail, demoOrganizationId } from './demo.js';
import { readClinicMetrics } from './clinic-metrics.js';
import { type Role } from './generated/prisma/client.js';
import { countryCode, currency, email, id, locale, name, parse, timezone } from './validation.js';

const marketDefaults = {
  BR: { timezone: 'America/Sao_Paulo', currency: 'BRL', locale: 'pt-BR' },
  PT: { timezone: 'Europe/Lisbon', currency: 'EUR', locale: 'pt-PT' },
  ES: { timezone: 'Europe/Madrid', currency: 'EUR', locale: 'es-ES' },
  US: { timezone: 'America/New_York', currency: 'USD', locale: 'en-US' },
} as const;

const clinicInput = z.strictObject({
  name,
  countryCode: countryCode.default('BR'),
  timezone: timezone.optional(),
  currency: currency.optional(),
  locale: locale.optional(),
}).transform((input) => ({
  ...input,
  timezone: input.timezone ?? marketDefaults[input.countryCode].timezone,
  currency: input.currency ?? marketDefaults[input.countryCode].currency,
  locale: input.locale ?? marketDefaults[input.countryCode].locale,
}));
const clinicUpdate = z.strictObject({
  name: name.optional(),
  countryCode: countryCode.optional(),
  timezone: timezone.optional(),
  currency: currency.optional(),
  locale: locale.optional(),
});
const memberInput = z.strictObject({ email, role: z.enum(['MANAGER', 'STAFF', 'VIEWER']) });
const statusInput = z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
const provisionInput = z.strictObject({
  name,
  countryCode: countryCode.default('BR'),
  timezone: timezone.optional(),
  currency: currency.optional(),
  locale: locale.optional(),
  ownerName: name,
  ownerEmail: email,
}).transform((input) => ({
  ...input,
  timezone: input.timezone ?? marketDefaults[input.countryCode].timezone,
  currency: input.currency ?? marketDefaults[input.countryCode].currency,
  locale: input.locale ?? marketDefaults[input.countryCode].locale,
}));

function envQuotaLimit(value: string | undefined, fallback: number) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : fallback;
}

@Injectable()
export class Access {
  constructor(private readonly db: Database, private readonly auth: Auth) {}

  async clinic(request: Request, orgId: string, allowed?: Role[]) {
    const user = await this.auth.requireUser(request);
    const organizationId = parse(id, orgId);
    if (user.isDemo && organizationId !== demoOrganizationId) throw new NotFoundException('Clínica indisponível.');
    const membership = await this.db.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      include: { organization: true },
    });
    if (!membership || membership.organization.status !== 'ACTIVE') throw new NotFoundException('Clínica indisponível.');
    if (allowed && !allowed.includes(membership.role)) throw new ForbiddenException('Você não tem permissão para esta ação.');
    return { user, membership, organization: membership.organization };
  }

  async admin(request: Request) {
    const user = await this.auth.requireUser(request);
    if (!user.isAdmin) throw new ForbiddenException('Acesso exclusivo da administração da plataforma.');
    return user;
  }
}

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly db: Database,
    private readonly auth: Auth,
    private readonly access: Access,
  ) {}

  @Post()
  async create(@Body() body: unknown, @Req() request: Request) {
    const user = await this.auth.requireUser(request);
    if (user.isDemo) throw new ForbiddenException('A demonstração usa uma clínica de teste.');
    const input = parse(clinicInput, body);
    return this.db.organization.create({
      data: {
        ...input,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
        auditEvents: { create: { actorId: user.id, action: 'organization.create' } },
      },
    });
  }

  @Get(':orgId')
  async get(@Param('orgId') orgId: string, @Req() request: Request) {
    const { organization } = await this.access.clinic(request, orgId);
    return organization;
  }

  @Patch(':orgId')
  async update(@Param('orgId') orgId: string, @Body() body: unknown, @Req() request: Request) {
    const { user } = await this.access.clinic(request, orgId, ['OWNER', 'MANAGER']);
    const input = parse(clinicUpdate, body);
    return this.db.organization.update({
      where: { id: orgId },
      data: { ...input, auditEvents: { create: { actorId: user.id, action: 'organization.update' } } },
    });
  }

  @Get(':orgId/dashboard')
  async dashboard(@Param('orgId') orgId: string, @Req() request: Request) {
    const { organization } = await this.access.clinic(request, orgId);
    return readClinicMetrics(this.db, organization.id, organization.timezone);
  }

  @Get(':orgId/reports/acquisition')
  async acquisition(@Param('orgId') orgId: string, @Req() request: Request) {
    await this.access.clinic(request, orgId);
    return this.db.$queryRaw<{source:string; contacts:number; converted:number}[]>`
      SELECT coalesce(c.source, 'UNKNOWN') AS source, count(*)::int AS contacts,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Opportunity" o WHERE o."organizationId" = c."organizationId"
            AND o."contactId" = c.id AND o.stage = 'WON'
        ))::int AS converted
      FROM "Contact" c WHERE c."organizationId" = ${orgId}::uuid
      GROUP BY c.source ORDER BY contacts DESC, source
    `;
  }

  @Get(':orgId/members')
  async members(@Param('orgId') orgId: string, @Req() request: Request) {
    await this.access.clinic(request, orgId, ['OWNER', 'MANAGER']);
    return this.db.membership.findMany({
      where: { organizationId: orgId },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  @Post(':orgId/members')
  async addMember(@Param('orgId') orgId: string, @Body() body: unknown, @Req() request: Request) {
    const { user, membership } = await this.access.clinic(request, orgId, ['OWNER', 'MANAGER']);
    const input = parse(memberInput, body);
    if (input.email === demoEmail) throw new ForbiddenException('Conta reservada à demonstração.');
    if (input.role === 'MANAGER' && membership.role !== 'OWNER') {
      throw new ForbiddenException('Somente o proprietário pode incluir gestores.');
    }
    const member = await this.db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (!member) throw new NotFoundException('A pessoa precisa criar uma conta antes de entrar na equipe.');
    return this.db.$transaction(async (tx) => {
      const result = await tx.membership.create({
        data: { organizationId: orgId, userId: member.id, role: input.role },
        select: { id: true, role: true, user: { select: { name: true, email: true } } },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'membership.create', resourceId: result.id },
      });
      return result;
    });
  }

  @Delete(':orgId/members/:memberId')
  @HttpCode(204)
  async removeMember(@Param('orgId') orgId: string, @Param('memberId') memberId: string, @Req() request: Request) {
    const { user, membership } = await this.access.clinic(request, orgId, ['OWNER', 'MANAGER']);
    await this.db.$transaction(async (tx) => {
      const result = await tx.membership.deleteMany({
        where: {
          id: parse(id, memberId), organizationId: orgId,
          role: { notIn: membership.role === 'OWNER' ? ['OWNER'] : ['OWNER', 'MANAGER'] },
        },
      });
      if (!result.count) throw new NotFoundException('Vínculo indisponível para remoção.');
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'membership.delete', resourceId: memberId },
      });
    });
  }
}

@Controller('admin')
export class PlatformAdminController {
  constructor(private readonly db: Database, private readonly access: Access) {}

  @Get('organizations')
  async list(@Req() request: Request) {
    await this.access.admin(request);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [orgs, aiByOrg, lastAudit] = await Promise.all([
      this.db.organization.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          countryCode: true,
          locale: true,
          timezone: true,
          status: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
      this.db.$queryRaw<Array<{
        organizationId: string;
        monthCalls: number;
        monthTokens: number;
        monthCostUsd: number;
        lastAiAt: Date | null;
      }>>`
        SELECT
          "organizationId",
          coalesce(sum("accountedCalls"), 0)::int AS "monthCalls",
          coalesce(sum("accountedTokens"), 0)::int AS "monthTokens",
          coalesce(sum("estimatedCostUsd"), 0)::float8 AS "monthCostUsd",
          max("createdAt") AS "lastAiAt"
        FROM "AiExecution"
        WHERE "quotaDay" >= ${monthStart}
        GROUP BY "organizationId"
      `,
      this.db.$queryRaw<Array<{ organizationId: string; lastAuditAt: Date }>>`
        SELECT "organizationId", max("createdAt") AS "lastAuditAt"
        FROM "AuditEvent"
        GROUP BY "organizationId"
      `,
    ]);

    const aiMap = new Map(aiByOrg.map((row) => [row.organizationId, row]));
    const auditMap = new Map(lastAudit.map((row) => [row.organizationId, row.lastAuditAt]));

    return orgs.map((org) => {
      const ai = aiMap.get(org.id);
      const lastAuditAt = auditMap.get(org.id) ?? null;
      const lastAiAt = ai?.lastAiAt ?? null;
      const candidates = [org.createdAt, lastAuditAt, lastAiAt].filter((d): d is Date => Boolean(d));
      const lastActivityAt = candidates.reduce((latest, current) => (current > latest ? current : latest), org.createdAt);

      return {
        id: org.id,
        name: org.name,
        countryCode: org.countryCode,
        locale: org.locale,
        timezone: org.timezone,
        status: org.status,
        createdAt: org.createdAt,
        memberCount: org._count.memberships,
        lastActivityAt,
        aiMonthCalls: ai?.monthCalls ?? 0,
        aiMonthTokens: ai?.monthTokens ?? 0,
        aiMonthCostUsd: Number((ai?.monthCostUsd ?? 0).toFixed(4)),
      };
    });
  }

  @Post('organizations/provision')
  async provision(@Body() body: unknown, @Req() request: Request) {
    const admin = await this.access.admin(request);
    const input = parse(provisionInput, body);
    if (input.ownerEmail === demoEmail) {
      throw new ForbiddenException('Conta reservada à demonstração.');
    }

    const existingUser = await this.db.user.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true, name: true, email: true },
    });

    const temporaryPassword = existingUser ? null : randomBytes(12).toString('base64url');
    const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : null;

    const result = await this.db.$transaction(async (tx) => {
      const owner = existingUser ?? await tx.user.create({
        data: {
          name: input.ownerName,
          email: input.ownerEmail,
          passwordHash: passwordHash!,
        },
        select: { id: true, name: true, email: true },
      });

      const organization = await tx.organization.create({
        data: {
          name: input.name,
          countryCode: input.countryCode,
          timezone: input.timezone,
          currency: input.currency,
          locale: input.locale,
          memberships: { create: { userId: owner.id, role: 'OWNER' } },
          auditEvents: {
            create: {
              actorId: admin.id,
              action: 'organization.provisioned',
              resourceId: owner.id,
            },
          },
        },
        select: { id: true, name: true, countryCode: true, timezone: true, currency: true, locale: true, status: true, createdAt: true },
      });

      return { organization, owner };
    });

    return {
      organization: result.organization,
      owner: {
        id: result.owner.id,
        name: result.owner.name,
        email: result.owner.email,
        createdNewUser: !existingUser,
      },
      temporaryPassword,
      loginPath: '/clinica',
    };
  }

  @Get('metrics/ai')
  async aiMetrics(@Req() request: Request) {
    await this.access.admin(request);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dailyCallLimit = envQuotaLimit(process.env.GEMINI_DAILY_CALL_LIMIT, 60);
    const dailyTokenLimit = envQuotaLimit(process.env.GEMINI_DAILY_TOKEN_LIMIT, 60_000);

    const [orgs, usageRows] = await Promise.all([
      this.db.organization.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true },
      }),
      this.db.$queryRaw<Array<{
        organizationId: string;
        monthCalls: number;
        monthTokens: number;
        monthCostUsd: number;
        todayCalls: number;
        todayTokens: number;
      }>>`
        SELECT
          "organizationId",
          coalesce(sum("accountedCalls"), 0)::int AS "monthCalls",
          coalesce(sum("accountedTokens"), 0)::int AS "monthTokens",
          coalesce(sum("estimatedCostUsd"), 0)::float8 AS "monthCostUsd",
          coalesce(sum("accountedCalls") FILTER (WHERE "quotaDay" = ${todayStart}), 0)::int AS "todayCalls",
          coalesce(sum("accountedTokens") FILTER (WHERE "quotaDay" = ${todayStart}), 0)::int AS "todayTokens"
        FROM "AiExecution"
        WHERE "quotaDay" >= ${monthStart}
        GROUP BY "organizationId"
      `,
    ]);

    const usageMap = new Map(usageRows.map((row) => [row.organizationId, row]));
    const byOrganization = orgs
      .map((org) => {
        const u = usageMap.get(org.id);
        const monthCalls = u?.monthCalls ?? 0;
        const monthTokens = u?.monthTokens ?? 0;
        const monthCostUsd = Number((u?.monthCostUsd ?? 0).toFixed(4));
        const todayCalls = u?.todayCalls ?? 0;
        const todayTokens = u?.todayTokens ?? 0;
        const callUsagePercent = dailyCallLimit > 0 ? Math.round((todayCalls / dailyCallLimit) * 1000) / 10 : 0;
        const tokenUsagePercent = dailyTokenLimit > 0 ? Math.round((todayTokens / dailyTokenLimit) * 1000) / 10 : 0;
        const nearQuota = callUsagePercent >= 80 || tokenUsagePercent >= 80;

        return {
          organizationId: org.id,
          organizationName: org.name,
          status: org.status,
          monthCalls,
          monthTokens,
          monthCostUsd,
          todayCalls,
          todayTokens,
          callUsagePercent,
          tokenUsagePercent,
          nearQuota,
        };
      })
      .sort((a, b) => b.monthTokens - a.monthTokens || b.todayCalls - a.todayCalls || a.organizationName.localeCompare(b.organizationName));

    const totals = byOrganization.reduce(
      (acc, item) => ({
        monthCalls: acc.monthCalls + item.monthCalls,
        monthTokens: acc.monthTokens + item.monthTokens,
        monthCostUsd: Number((acc.monthCostUsd + item.monthCostUsd).toFixed(4)),
        todayCalls: acc.todayCalls + item.todayCalls,
        todayTokens: acc.todayTokens + item.todayTokens,
        nearQuotaCount: acc.nearQuotaCount + (item.nearQuota ? 1 : 0),
      }),
      { monthCalls: 0, monthTokens: 0, monthCostUsd: 0, todayCalls: 0, todayTokens: 0, nearQuotaCount: 0 },
    );

    return {
      month: monthStart.toISOString().slice(0, 7),
      today: todayStart.toISOString().slice(0, 10),
      dailyCallLimit,
      dailyTokenLimit,
      totals,
      byOrganization,
    };
  }

  @Patch('organizations/:orgId')
  async update(@Param('orgId') orgId: string, @Body() body: unknown, @Req() request: Request) {
    const user = await this.access.admin(request);
    const input = parse(statusInput, body);
    const organizationId = parse(id, orgId);
    const exists = await this.db.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Clínica indisponível.');
    return this.db.organization.update({
      where: { id: organizationId },
      data: { status: input.status, auditEvents: { create: { actorId: user.id, action: `organization.${input.status.toLowerCase()}` } } },
    });
  }
}
