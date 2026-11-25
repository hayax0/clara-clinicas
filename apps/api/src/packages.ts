import {
  BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { type Prisma, type Role } from './generated/prisma/client.js';
import { Access } from './organizations.js';
import { id, parse } from './validation.js';

const readRoles: Role[] = ['OWNER', 'MANAGER', 'STAFF'];
const manageRoles: Role[] = ['OWNER', 'MANAGER'];

const dateOnly = z.iso.date('Informe uma data válida (AAAA-MM-DD).');
const optionalId = z.union([id, z.literal('')]).nullish().transform((value) => value || null);
const optionalNotes = z.string().trim().max(300).nullish().transform((value) => value || null);
const optionalShortNotes = z.string().trim().max(240).nullish().transform((value) => value || null);

const catalogCreateInput = z.strictObject({
  name: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120),
  serviceId: optionalId,
  totalSessions: z.number().int().min(1, 'Informe ao menos 1 sessão.').max(200),
  priceCents: z.number().int().min(0).max(100_000_000),
  validityDays: z.number().int().min(1).max(1825).nullish().transform((value) => value ?? null),
});

const catalogUpdateInput = z.strictObject({
  name: z.string().trim().min(2).max(120).optional(),
  serviceId: optionalId,
  totalSessions: z.number().int().min(1).max(200).optional(),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  validityDays: z.number().int().min(1).max(1825).nullish(),
  active: z.boolean().optional(),
});

const assignInput = z.strictObject({
  patientId: id,
  packageId: id,
  professionalId: optionalId,
  purchasedAt: dateOnly.optional(),
  expiresAt: z.union([dateOnly, z.literal('')]).nullish().transform((value) => value || null),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  notes: optionalNotes,
  createFinanceEntry: z.boolean().default(false),
  dueDate: z.union([dateOnly, z.literal('')]).nullish().transform((value) => value || null),
  categoryId: optionalId,
});

const consumeInput = z.strictObject({
  appointmentId: optionalId,
  notes: optionalShortNotes,
});

const listQuerySchema = z.strictObject({
  patientId: id.optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

function clinicToday(timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function addDays(dateStr: string, days: number) {
  const date = toDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date)!;
}

const assignmentSelect = {
  id: true,
  patientId: true,
  packageId: true,
  professionalId: true,
  financeEntryId: true,
  totalSessions: true,
  usedSessions: true,
  priceCents: true,
  status: true,
  purchasedAt: true,
  expiresAt: true,
  notes: true,
  createdAt: true,
  patient: { select: { id: true, name: true } },
  servicePackage: { select: { id: true, name: true, service: { select: { id: true, name: true } } } },
  professional: { select: { id: true, name: true } },
  financeEntry: { select: { id: true, status: true, dueDate: true, amountCents: true } },
  createdBy: { select: { id: true, name: true } },
  usages: {
    orderBy: { usedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      appointmentId: true,
      usedAt: true,
      notes: true,
      revertedAt: true,
      recordedBy: { select: { id: true, name: true } },
      revertedBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PatientPackageSelect;

type SelectedAssignment = Prisma.PatientPackageGetPayload<{ select: typeof assignmentSelect }>;

function serializeAssignment(row: SelectedAssignment, today: string) {
  const expiresAt = formatDate(row.expiresAt);
  return {
    ...row,
    remainingSessions: Math.max(0, row.totalSessions - row.usedSessions),
    purchasedAt: formatDate(row.purchasedAt)!,
    expiresAt,
    expired: Boolean(expiresAt && expiresAt < today && row.status === 'ACTIVE'),
    financeEntry: row.financeEntry
      ? { ...row.financeEntry, dueDate: formatDate(row.financeEntry.dueDate)! }
      : null,
  };
}

@Controller('organizations/:orgId/packages')
export class PackagesController {
  constructor(private readonly db: Database, private readonly access: Access) {}

  @Get('catalog')
  async listCatalog(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, readRoles);
    return this.db.servicePackage.findMany({
      where: { organizationId: orgId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        serviceId: true,
        totalSessions: true,
        priceCents: true,
        validityDays: true,
        active: true,
        createdAt: true,
        service: { select: { id: true, name: true } },
      },
    });
  }

  @Post('catalog')
  async createCatalog(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, manageRoles);
    const input = parse(catalogCreateInput, body);
    return this.db.$transaction(async (tx) => {
      const created = await tx.servicePackage.create({
        data: {
          organizationId: orgId,
          name: input.name,
          serviceId: input.serviceId,
          totalSessions: input.totalSessions,
          priceCents: input.priceCents,
          validityDays: input.validityDays,
        },
        select: {
          id: true, name: true, serviceId: true, totalSessions: true, priceCents: true,
          validityDays: true, active: true, createdAt: true,
          service: { select: { id: true, name: true } },
        },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.catalog.created', resourceId: created.id },
      });
      return created;
    });
  }

  @Patch('catalog/:packageId')
  async updateCatalog(
    @Param('orgId') orgId: string,
    @Param('packageId') packageKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, manageRoles);
    const packageId = parse(id, packageKey);
    const incoming = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const input = parse(catalogUpdateInput, body);
    if (!Object.keys(incoming).length) throw new BadRequestException('Informe o que deseja alterar.');

    return this.db.$transaction(async (tx) => {
      const existing = await tx.servicePackage.findFirst({
        where: { id: packageId, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Pacote indisponível.');
      const updated = await tx.servicePackage.update({
        where: { id: packageId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(Object.hasOwn(incoming, 'serviceId') && { serviceId: input.serviceId }),
          ...(input.totalSessions !== undefined && { totalSessions: input.totalSessions }),
          ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
          ...(Object.hasOwn(incoming, 'validityDays') && { validityDays: input.validityDays ?? null }),
          ...(input.active !== undefined && { active: input.active }),
        },
        select: {
          id: true, name: true, serviceId: true, totalSessions: true, priceCents: true,
          validityDays: true, active: true, createdAt: true,
          service: { select: { id: true, name: true } },
        },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.catalog.updated', resourceId: packageId },
      });
      return updated;
    });
  }

  @Get()
  async listAssignments(@Param('orgId') orgId: string, @Query() query: Record<string, string>, @Req() req: Request) {
    const { organization } = await this.access.clinic(req, orgId, readRoles);
    const filters = parse(listQuerySchema, {
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.status && { status: query.status }),
    });
    const today = clinicToday(organization.timezone);
    const rows = await this.db.patientPackage.findMany({
      where: {
        organizationId: orgId,
        ...(filters.patientId && { patientId: filters.patientId }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: assignmentSelect,
    });
    return rows.map((row) => serializeAssignment(row, today));
  }

  @Post('assign')
  async assign(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user, organization } = await this.access.clinic(req, orgId, readRoles);
    const input = parse(assignInput, body);
    const today = clinicToday(organization.timezone);
    const purchasedAt = input.purchasedAt ?? today;

    return this.db.$transaction(async (tx) => {
      const pkg = await tx.servicePackage.findFirst({
        where: { id: input.packageId, organizationId: orgId },
        select: { id: true, name: true, totalSessions: true, priceCents: true, validityDays: true, active: true },
      });
      if (!pkg) throw new BadRequestException('Selecione um pacote válido desta clínica.');
      if (!pkg.active) throw new BadRequestException('Este pacote está inativo no catálogo.');

      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, organizationId: orgId },
        select: { id: true, name: true },
      });
      if (!patient) throw new BadRequestException('Selecione um paciente válido desta clínica.');

      const priceCents = input.priceCents ?? pkg.priceCents;
      const expiresAtStr = input.expiresAt ?? (pkg.validityDays ? addDays(purchasedAt, pkg.validityDays) : null);
      if (expiresAtStr && expiresAtStr < purchasedAt) {
        throw new BadRequestException('A validade deve ser igual ou posterior à data de contratação.');
      }

      let financeEntryId: string | null = null;
      if (input.createFinanceEntry) {
        if (priceCents <= 0) {
          throw new BadRequestException('Para gerar conta a receber no Financeiro, informe um valor maior que zero.');
        }
        if (input.categoryId) {
          const category = await tx.financeCategory.findFirst({
            where: { id: input.categoryId, organizationId: orgId },
            select: { id: true, type: true, active: true },
          });
          if (!category || !category.active || category.type !== 'INCOME') {
            throw new BadRequestException('Selecione uma categoria ativa de receita desta clínica.');
          }
        }
        const entry = await tx.financeEntry.create({
          data: {
            organizationId: orgId,
            type: 'INCOME',
            description: `Pacote: ${pkg.name} — ${patient.name}`.slice(0, 160),
            amountCents: priceCents,
            dueDate: toDate(input.dueDate ?? purchasedAt),
            categoryId: input.categoryId,
            patientId: patient.id,
            professionalId: input.professionalId,
            notes: input.notes,
            createdById: user.id,
          },
          select: { id: true },
        });
        financeEntryId = entry.id;
        await tx.auditEvent.create({
          data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.created', resourceId: entry.id },
        });
      }

      const assigned = await tx.patientPackage.create({
        data: {
          organizationId: orgId,
          patientId: patient.id,
          packageId: pkg.id,
          professionalId: input.professionalId,
          financeEntryId,
          totalSessions: pkg.totalSessions,
          priceCents,
          purchasedAt: toDate(purchasedAt),
          expiresAt: expiresAtStr ? toDate(expiresAtStr) : null,
          notes: input.notes,
          createdById: user.id,
        },
        select: assignmentSelect,
      });

      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.assigned', resourceId: assigned.id },
      });
      return serializeAssignment(assigned, today);
    });
  }

  @Post(':patientPackageId/consume')
  async consume(
    @Param('orgId') orgId: string,
    @Param('patientPackageId') pkgKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user, organization } = await this.access.clinic(req, orgId, readRoles);
    const patientPackageId = parse(id, pkgKey);
    const input = parse(consumeInput, body ?? {});
    const today = clinicToday(organization.timezone);

    return this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{
        id: string;
        patientId: string;
        status: string;
        totalSessions: number;
        usedSessions: number;
        expiresAt: Date | null;
      }>>`
        SELECT id, "patientId", status::text AS status, "totalSessions", "usedSessions", "expiresAt"
        FROM "PatientPackage"
        WHERE id = ${patientPackageId}::uuid AND "organizationId" = ${orgId}::uuid
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Pacote do paciente indisponível.');
      if (locked.status !== 'ACTIVE') {
        throw new ConflictException('Somente pacotes ativos podem registrar novas sessões.');
      }
      const expiresAtStr = formatDate(locked.expiresAt);
      if (expiresAtStr && expiresAtStr < today) {
        throw new ConflictException(`Este pacote venceu em ${expiresAtStr}.`);
      }
      if (locked.usedSessions >= locked.totalSessions) {
        throw new ConflictException('Todas as sessões deste pacote já foram utilizadas.');
      }

      if (input.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, organizationId: orgId, patientId: locked.patientId },
          select: { id: true },
        });
        if (!appointment) {
          throw new BadRequestException('Selecione um agendamento válido deste paciente nesta clínica.');
        }
        const alreadyUsed = await tx.packageSessionUsage.findFirst({
          where: { organizationId: orgId, appointmentId: input.appointmentId, revertedAt: null },
          select: { id: true },
        });
        if (alreadyUsed) {
          throw new ConflictException('Este agendamento já foi vinculado a uma sessão de pacote.');
        }
      }

      const usage = await tx.packageSessionUsage.create({
        data: {
          organizationId: orgId,
          patientPackageId,
          appointmentId: input.appointmentId,
          notes: input.notes,
          recordedById: user.id,
        },
        select: { id: true },
      });

      const nextUsed = locked.usedSessions + 1;
      const updated = await tx.patientPackage.update({
        where: { id: patientPackageId },
        data: {
          usedSessions: nextUsed,
          ...(nextUsed >= locked.totalSessions && { status: 'COMPLETED' }),
        },
        select: assignmentSelect,
      });

      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.session.consumed', resourceId: usage.id },
      });
      return serializeAssignment(updated, today);
    });
  }

  @Post(':patientPackageId/usages/:usageId/revert')
  async revertUsage(
    @Param('orgId') orgId: string,
    @Param('patientPackageId') pkgKey: string,
    @Param('usageId') usageKey: string,
    @Req() req: Request,
  ) {
    const { user, organization } = await this.access.clinic(req, orgId, manageRoles);
    const patientPackageId = parse(id, pkgKey);
    const usageId = parse(id, usageKey);
    const today = clinicToday(organization.timezone);

    return this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; usedSessions: number }>>`
        SELECT id, status::text AS status, "usedSessions"
        FROM "PatientPackage"
        WHERE id = ${patientPackageId}::uuid AND "organizationId" = ${orgId}::uuid
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Pacote do paciente indisponível.');
      if (locked.status === 'CANCELLED') {
        throw new ConflictException('Não é possível estornar sessão de um pacote cancelado.');
      }

      const usage = await tx.packageSessionUsage.findFirst({
        where: { id: usageId, organizationId: orgId, patientPackageId },
        select: { id: true, revertedAt: true },
      });
      if (!usage) throw new NotFoundException('Registro de sessão indisponível.');
      if (usage.revertedAt) throw new ConflictException('Esta sessão já foi estornada.');

      await tx.packageSessionUsage.update({
        where: { id: usageId },
        data: { revertedAt: new Date(), revertedById: user.id },
      });

      const nextUsed = Math.max(0, locked.usedSessions - 1);
      const updated = await tx.patientPackage.update({
        where: { id: patientPackageId },
        data: {
          usedSessions: nextUsed,
          ...(locked.status === 'COMPLETED' && { status: 'ACTIVE' }),
        },
        select: assignmentSelect,
      });

      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.session.reverted', resourceId: usageId },
      });
      return serializeAssignment(updated, today);
    });
  }

  @Post(':patientPackageId/cancel')
  async cancelAssignment(
    @Param('orgId') orgId: string,
    @Param('patientPackageId') pkgKey: string,
    @Req() req: Request,
  ) {
    const { user, organization } = await this.access.clinic(req, orgId, manageRoles);
    const patientPackageId = parse(id, pkgKey);
    const today = clinicToday(organization.timezone);

    return this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status::text AS status
        FROM "PatientPackage"
        WHERE id = ${patientPackageId}::uuid AND "organizationId" = ${orgId}::uuid
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Pacote do paciente indisponível.');
      if (locked.status !== 'ACTIVE') {
        throw new ConflictException('Somente pacotes ativos podem ser cancelados.');
      }

      const updated = await tx.patientPackage.update({
        where: { id: patientPackageId },
        data: { status: 'CANCELLED' },
        select: assignmentSelect,
      });

      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'packages.cancelled', resourceId: patientPackageId },
      });
      return serializeAssignment(updated, today);
    });
  }
}
