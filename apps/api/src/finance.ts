import {
  BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { Prisma, type Role } from './generated/prisma/client.js';
import { Access } from './organizations.js';
import { id, parse } from './validation.js';

const financeReadRoles: Role[] = ['OWNER', 'MANAGER', 'STAFF'];
const financeManageRoles: Role[] = ['OWNER', 'MANAGER'];
const financeOwnerRoles: Role[] = ['OWNER'];

const financeType = z.enum(['INCOME', 'EXPENSE']);
const entryStatus = z.enum(['PENDING', 'PAID', 'CANCELLED']);
const paymentMethod = z.enum(['CASH', 'PIX', 'CARD', 'TRANSFER', 'OTHER']);
const dateOnly = z.iso.date('Informe uma data válida (AAAA-MM-DD).');
const optionalNotes = z.string().trim().max(300).nullish().transform((value) => value || null);
const optionalId = z.union([id, z.literal('')]).nullish().transform((value) => value || null);

const categoryCreateInput = z.strictObject({
  name: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80),
  type: financeType,
});

const categoryUpdateInput = z.strictObject({
  name: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80).optional(),
  active: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.active !== undefined, 'Informe o que deseja alterar.');

const entryCreateInput = z.strictObject({
  type: financeType,
  description: z.string().trim().min(2, 'Informe uma descrição.').max(160),
  amountCents: z.number().int().min(1, 'Informe um valor maior que zero.').max(100_000_000),
  dueDate: dateOnly,
  categoryId: optionalId,
  patientId: optionalId,
  professionalId: optionalId,
  notes: optionalNotes,
});

const entryUpdateInput = z.strictObject({
  description: z.string().trim().min(2, 'Informe uma descrição.').max(160).optional(),
  amountCents: z.number().int().min(1, 'Informe um valor maior que zero.').max(100_000_000).optional(),
  dueDate: dateOnly.optional(),
  categoryId: optionalId,
  patientId: optionalId,
  professionalId: optionalId,
  notes: optionalNotes,
});

const settleInput = z.strictObject({
  settledDate: dateOnly,
  paymentMethod,
  notes: optionalNotes,
});

const closingCreateInput = z.strictObject({
  closingDate: dateOnly,
  notes: optionalNotes,
});

const closingReopenInput = z.strictObject({
  reason: z.string().trim().min(5, 'Informe o motivo da reabertura (mínimo 5 caracteres).').max(280),
});

const periodQuerySchema = z.strictObject({
  from: dateOnly,
  to: dateOnly,
}).refine(
  (value) => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86_400_000,
  'Informe um período válido de até 366 dias.',
);

const exportQuerySchema = z.strictObject({
  from: dateOnly,
  to: dateOnly,
  type: z.enum(['INCOME', 'EXPENSE', 'ALL']).default('ALL'),
}).refine(
  (value) => value.from <= value.to && Date.parse(value.to) - Date.parse(value.from) <= 366 * 86_400_000,
  'Informe um período válido de até 366 dias.',
);

const paymentMethodLabelsPt: Record<'CASH' | 'PIX' | 'CARD' | 'TRANSFER' | 'OTHER', string> = {
  PIX: 'Pix',
  CARD: 'Cartão',
  CASH: 'Dinheiro',
  TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

const paymentMethodLabelsEn: Record<'CASH' | 'PIX' | 'CARD' | 'TRANSFER' | 'OTHER', string> = {
  PIX: 'Instant transfer',
  CARD: 'Card',
  CASH: 'Cash',
  TRANSFER: 'Bank transfer',
  OTHER: 'Other',
};

const paymentMethodLabelsPtPt: Record<'CASH' | 'PIX' | 'CARD' | 'TRANSFER' | 'OTHER', string> = {
  PIX: 'Pix', CARD: 'Cartão', CASH: 'Numerário', TRANSFER: 'Transferência bancária', OTHER: 'Outro',
};

const paymentMethodLabelsEs: Record<'CASH' | 'PIX' | 'CARD' | 'TRANSFER' | 'OTHER', string> = {
  PIX: 'Transferencia instantánea (Pix)', CARD: 'Tarjeta', CASH: 'Efectivo', TRANSFER: 'Transferencia bancaria', OTHER: 'Otro',
};

const entryStatusLabelsPt: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PAID: 'Pago',
  PENDING: 'Em aberto',
  CANCELLED: 'Cancelado',
};

const entryStatusLabelsEn: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PAID: 'Paid',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
};

const entryStatusLabelsPtPt: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PAID: 'Pago', PENDING: 'Por pagar/receber', CANCELLED: 'Anulado',
};

const entryStatusLabelsEs: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PAID: 'Pagado', PENDING: 'Pendiente', CANCELLED: 'Cancelado',
};

function formatDateCsv(value: Date | null | undefined, locale: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function formatCentsCsv(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(cents / 100);
}

function escapeCsvCell(value: string, delimiter: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (safe.includes(delimiter) || /[;,"\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function slugifyClinicName(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'clinica';
}

function sharePercent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

const entriesQuerySchema = z.strictObject({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  type: financeType.optional(),
  status: entryStatus.optional(),
}).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  'A data inicial deve ser anterior ou igual à final.',
);

function clinicToday(timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function lockCashDate(tx: Prisma.TransactionClient, orgId: string, day: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance:${orgId}:${day}`}))`;
}

async function assertDayOpen(tx: Prisma.TransactionClient, orgId: string, day: string) {
  const closed = await tx.cashClosing.findUnique({
    where: { organizationId_closingDate: { organizationId: orgId, closingDate: toDate(day) } },
    select: { status: true },
  });
  if (closed?.status === 'CLOSED') {
    throw new ConflictException(`O caixa do dia ${day} está fechado. Somente o proprietário pode reabri-lo.`);
  }
}

const entrySelect = {
  id: true,
  type: true,
  status: true,
  description: true,
  amountCents: true,
  dueDate: true,
  settledDate: true,
  settledAt: true,
  paymentMethod: true,
  categoryId: true,
  patientId: true,
  professionalId: true,
  notes: true,
  reconciledAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, type: true } },
  patient: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  settledBy: { select: { id: true, name: true } },
  reconciledBy: { select: { id: true, name: true } },
} satisfies Prisma.FinanceEntrySelect;

type SelectedEntry = Prisma.FinanceEntryGetPayload<{ select: typeof entrySelect }>;

function serializeEntry(entry: SelectedEntry) {
  return {
    ...entry,
    dueDate: formatDate(entry.dueDate)!,
    settledDate: formatDate(entry.settledDate),
  };
}

@Controller('organizations/:orgId/finance')
export class FinanceController {
  constructor(private readonly db: Database, private readonly access: Access) {}

  @Get('categories')
  async listCategories(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, financeReadRoles);
    return this.db.financeCategory.findMany({
      where: { organizationId: orgId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true, active: true, createdAt: true },
    });
  }

  @Post('categories')
  async createCategory(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, financeManageRoles);
    const input = parse(categoryCreateInput, body);
    return this.db.$transaction(async (tx) => {
      const created = await tx.financeCategory.create({
        data: { organizationId: orgId, name: input.name, type: input.type },
        select: { id: true, name: true, type: true, active: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.category.created', resourceId: created.id },
      });
      return created;
    });
  }

  @Patch('categories/:categoryId')
  async updateCategory(
    @Param('orgId') orgId: string,
    @Param('categoryId') categoryKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeManageRoles);
    const categoryId = parse(id, categoryKey);
    const input = parse(categoryUpdateInput, body);
    return this.db.$transaction(async (tx) => {
      const existing = await tx.financeCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Categoria financeira indisponível.');
      const updated = await tx.financeCategory.update({
        where: { id: categoryId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.active !== undefined && { active: input.active }),
        },
        select: { id: true, name: true, type: true, active: true, createdAt: true },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.category.updated', resourceId: categoryId },
      });
      return updated;
    });
  }

  @Get('summary')
  async summary(@Param('orgId') orgId: string, @Query() query: Record<string, string>, @Req() req: Request) {
    const { organization } = await this.access.clinic(req, orgId, financeReadRoles);
    const today = clinicToday(organization.timezone);
    const period = parse(periodQuerySchema, {
      from: query.from || `${today.slice(0, 8)}01`,
      to: query.to || today,
    });
    const [totals, overdue, byCategory, closedDays] = await Promise.all([
      this.db.$queryRaw<Array<{
        receivedCents: number;
        paidCents: number;
        receivableOpenCents: number;
        payableOpenCents: number;
        unreconciledCount: number;
      }>>`
        SELECT
          coalesce(sum("amountCents") FILTER (WHERE "status" = 'PAID' AND "type" = 'INCOME' AND "settledDate" BETWEEN ${period.from}::date AND ${period.to}::date), 0)::int AS "receivedCents",
          coalesce(sum("amountCents") FILTER (WHERE "status" = 'PAID' AND "type" = 'EXPENSE' AND "settledDate" BETWEEN ${period.from}::date AND ${period.to}::date), 0)::int AS "paidCents",
          coalesce(sum("amountCents") FILTER (WHERE "status" = 'PENDING' AND "type" = 'INCOME' AND "dueDate" BETWEEN ${period.from}::date AND ${period.to}::date), 0)::int AS "receivableOpenCents",
          coalesce(sum("amountCents") FILTER (WHERE "status" = 'PENDING' AND "type" = 'EXPENSE' AND "dueDate" BETWEEN ${period.from}::date AND ${period.to}::date), 0)::int AS "payableOpenCents",
          count(*) FILTER (WHERE "status" = 'PAID' AND "reconciledAt" IS NULL AND "settledDate" BETWEEN ${period.from}::date AND ${period.to}::date)::int AS "unreconciledCount"
        FROM "FinanceEntry"
        WHERE "organizationId" = ${orgId}::uuid
      `,
      this.db.$queryRaw<Array<{ overdueReceivableCents: number; overduePayableCents: number }>>`
        SELECT
          coalesce(sum("amountCents") FILTER (WHERE "type" = 'INCOME'), 0)::int AS "overdueReceivableCents",
          coalesce(sum("amountCents") FILTER (WHERE "type" = 'EXPENSE'), 0)::int AS "overduePayableCents"
        FROM "FinanceEntry"
        WHERE "organizationId" = ${orgId}::uuid AND "status" = 'PENDING' AND "dueDate" < ${today}::date
      `,
      this.db.$queryRaw<Array<{
        categoryId: string | null;
        categoryName: string;
        type: 'INCOME' | 'EXPENSE';
        totalCents: number;
        count: number;
      }>>`
        SELECT
          e."categoryId",
          coalesce(c."name", 'Sem categoria') AS "categoryName",
          e."type",
          coalesce(sum(e."amountCents"), 0)::int AS "totalCents",
          count(*)::int AS "count"
        FROM "FinanceEntry" e
        LEFT JOIN "FinanceCategory" c ON c."organizationId" = e."organizationId" AND c."id" = e."categoryId"
        WHERE e."organizationId" = ${orgId}::uuid
          AND e."status" = 'PAID'
          AND e."settledDate" BETWEEN ${period.from}::date AND ${period.to}::date
        GROUP BY e."categoryId", c."name", e."type"
        ORDER BY e."type" ASC, "totalCents" DESC, "categoryName" ASC
      `,
      this.db.cashClosing.count({
        where: {
          organizationId: orgId,
          status: 'CLOSED',
          closingDate: { gte: toDate(period.from), lte: toDate(period.to) },
        },
      }),
    ]);

    const receivedCents = totals[0]?.receivedCents ?? 0;
    const paidCents = totals[0]?.paidCents ?? 0;
    return {
      from: period.from,
      to: period.to,
      today,
      currency: organization.currency,
      locale: organization.locale,
      receivedCents,
      paidCents,
      netCents: receivedCents - paidCents,
      receivableOpenCents: totals[0]?.receivableOpenCents ?? 0,
      payableOpenCents: totals[0]?.payableOpenCents ?? 0,
      overdueReceivableCents: overdue[0]?.overdueReceivableCents ?? 0,
      overduePayableCents: overdue[0]?.overduePayableCents ?? 0,
      unreconciledCount: totals[0]?.unreconciledCount ?? 0,
      closedDaysCount: closedDays,
      byCategory,
    };
  }

  @Get('reports/breakdown')
  async reportBreakdown(@Param('orgId') orgId: string, @Query() query: Record<string, string>, @Req() req: Request) {
    const { organization } = await this.access.clinic(req, orgId, financeReadRoles);
    const today = clinicToday(organization.timezone);
    const period = parse(periodQuerySchema, {
      from: query.from || `${today.slice(0, 8)}01`,
      to: query.to || today,
    });

    const [byPaymentRaw, byCategoryRaw, byProfessionalRaw, dailyRaw, closedDatesRaw, overdueTotalsRaw, overdueTopRaw] =
      await Promise.all([
        this.db.$queryRaw<Array<{
          paymentMethod: 'CASH' | 'PIX' | 'CARD' | 'TRANSFER' | 'OTHER' | null;
          amountCents: number;
          count: number;
        }>>`
          SELECT
            "paymentMethod",
            coalesce(sum("amountCents"), 0)::int AS "amountCents",
            count(*)::int AS "count"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${orgId}::uuid
            AND "status" = 'PAID'
            AND "type" = 'INCOME'
            AND "settledDate" BETWEEN ${period.from}::date AND ${period.to}::date
          GROUP BY "paymentMethod"
          ORDER BY "amountCents" DESC, "count" DESC
        `,
        this.db.$queryRaw<Array<{
          categoryId: string | null;
          categoryName: string;
          type: 'INCOME' | 'EXPENSE';
          totalCents: number;
          count: number;
        }>>`
          SELECT
            e."categoryId",
            coalesce(c."name", 'Sem categoria') AS "categoryName",
            e."type",
            coalesce(sum(e."amountCents"), 0)::int AS "totalCents",
            count(*)::int AS "count"
          FROM "FinanceEntry" e
          LEFT JOIN "FinanceCategory" c ON c."organizationId" = e."organizationId" AND c."id" = e."categoryId"
          WHERE e."organizationId" = ${orgId}::uuid
            AND e."status" = 'PAID'
            AND e."settledDate" BETWEEN ${period.from}::date AND ${period.to}::date
          GROUP BY e."categoryId", c."name", e."type"
          ORDER BY e."type" ASC, "totalCents" DESC, "categoryName" ASC
        `,
        this.db.$queryRaw<Array<{
          professionalId: string | null;
          professionalName: string;
          amountCents: number;
          count: number;
        }>>`
          SELECT
            e."professionalId",
            coalesce(p."name", 'Sem profissional') AS "professionalName",
            coalesce(sum(e."amountCents"), 0)::int AS "amountCents",
            count(*)::int AS "count"
          FROM "FinanceEntry" e
          LEFT JOIN "Professional" p ON p."organizationId" = e."organizationId" AND p."id" = e."professionalId"
          WHERE e."organizationId" = ${orgId}::uuid
            AND e."status" = 'PAID'
            AND e."type" = 'INCOME'
            AND e."settledDate" BETWEEN ${period.from}::date AND ${period.to}::date
          GROUP BY e."professionalId", p."name"
          ORDER BY "amountCents" DESC, "professionalName" ASC
        `,
        this.db.$queryRaw<Array<{
          date: Date;
          receivedCents: number;
          paidCents: number;
        }>>`
          SELECT
            "settledDate" AS "date",
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'INCOME'), 0)::int AS "receivedCents",
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'EXPENSE'), 0)::int AS "paidCents"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${orgId}::uuid
            AND "status" = 'PAID'
            AND "settledDate" BETWEEN ${period.from}::date AND ${period.to}::date
          GROUP BY "settledDate"
          ORDER BY "settledDate" ASC
        `,
        this.db.cashClosing.findMany({
          where: {
            organizationId: orgId,
            status: 'CLOSED',
            closingDate: { gte: toDate(period.from), lte: toDate(period.to) },
          },
          select: { closingDate: true },
        }),
        this.db.$queryRaw<Array<{
          receivableCents: number;
          receivableCount: number;
          payableCents: number;
          payableCount: number;
        }>>`
          SELECT
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'INCOME'), 0)::int AS "receivableCents",
            count(*) FILTER (WHERE "type" = 'INCOME')::int AS "receivableCount",
            coalesce(sum("amountCents") FILTER (WHERE "type" = 'EXPENSE'), 0)::int AS "payableCents",
            count(*) FILTER (WHERE "type" = 'EXPENSE')::int AS "payableCount"
          FROM "FinanceEntry"
          WHERE "organizationId" = ${orgId}::uuid
            AND "status" = 'PENDING'
            AND "dueDate" < ${today}::date
        `,
        this.db.$queryRaw<Array<{
          id: string;
          type: 'INCOME' | 'EXPENSE';
          description: string;
          amountCents: number;
          dueDate: Date;
          daysOverdue: number;
          patientName: string | null;
          categoryName: string | null;
        }>>`
          SELECT
            e."id",
            e."type",
            e."description",
            e."amountCents"::int AS "amountCents",
            e."dueDate",
            (${today}::date - e."dueDate")::int AS "daysOverdue",
            pt."name" AS "patientName",
            c."name" AS "categoryName"
          FROM "FinanceEntry" e
          LEFT JOIN "Patient" pt ON pt."organizationId" = e."organizationId" AND pt."id" = e."patientId"
          LEFT JOIN "FinanceCategory" c ON c."organizationId" = e."organizationId" AND c."id" = e."categoryId"
          WHERE e."organizationId" = ${orgId}::uuid
            AND e."status" = 'PENDING'
            AND e."dueDate" < ${today}::date
          ORDER BY e."amountCents" DESC, e."dueDate" ASC
          LIMIT 5
        `,
      ]);

    const totalReceivedCents = byCategoryRaw
      .filter((row) => row.type === 'INCOME')
      .reduce((acc, row) => acc + row.totalCents, 0);
    const totalPaidCents = byCategoryRaw
      .filter((row) => row.type === 'EXPENSE')
      .reduce((acc, row) => acc + row.totalCents, 0);

    const byPaymentMethod = byPaymentRaw.map((row) => ({
      paymentMethod: row.paymentMethod ?? 'OTHER',
      amountCents: row.amountCents,
      count: row.count,
      sharePercent: sharePercent(row.amountCents, totalReceivedCents),
    }));

    const byCategory = byCategoryRaw.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      type: row.type,
      totalCents: row.totalCents,
      count: row.count,
      sharePercent: sharePercent(row.totalCents, row.type === 'INCOME' ? totalReceivedCents : totalPaidCents),
    }));

    const byProfessional = byProfessionalRaw.map((row) => ({
      professionalId: row.professionalId,
      professionalName: row.professionalName,
      amountCents: row.amountCents,
      count: row.count,
      averageTicketCents: row.count > 0 ? Math.round(row.amountCents / row.count) : 0,
    }));

    const closedSet = new Set(closedDatesRaw.map((row) => formatDate(row.closingDate)!));
    const dailyMap = new Map<string, { receivedCents: number; paidCents: number }>();
    for (const row of dailyRaw) {
      const key = formatDate(row.date)!;
      dailyMap.set(key, { receivedCents: row.receivedCents, paidCents: row.paidCents });
    }
    for (const closedDay of closedSet) {
      if (!dailyMap.has(closedDay)) {
        dailyMap.set(closedDay, { receivedCents: 0, paidCents: 0 });
      }
    }
    const dailyFlow = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        receivedCents: vals.receivedCents,
        paidCents: vals.paidCents,
        netCents: vals.receivedCents - vals.paidCents,
        cashClosed: closedSet.has(date),
      }));

    const overdueTotals = overdueTotalsRaw[0] ?? {
      receivableCents: 0,
      receivableCount: 0,
      payableCents: 0,
      payableCount: 0,
    };

    return {
      from: period.from,
      to: period.to,
      today,
      currency: organization.currency,
      locale: organization.locale,
      totals: {
        receivedCents: totalReceivedCents,
        paidCents: totalPaidCents,
        netCents: totalReceivedCents - totalPaidCents,
      },
      byPaymentMethod,
      byCategory,
      byProfessional,
      dailyFlow,
      overdue: {
        receivableCents: overdueTotals.receivableCents,
        receivableCount: overdueTotals.receivableCount,
        payableCents: overdueTotals.payableCents,
        payableCount: overdueTotals.payableCount,
        totalCents: overdueTotals.receivableCents + overdueTotals.payableCents,
        totalCount: overdueTotals.receivableCount + overdueTotals.payableCount,
        topItems: overdueTopRaw.map((item) => ({
          ...item,
          dueDate: formatDate(item.dueDate)!,
        })),
      },
    };
  }

  @Get('reports/export.csv')
  async exportCsv(
    @Param('orgId') orgId: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { organization } = await this.access.clinic(req, orgId, financeReadRoles);
    const today = clinicToday(organization.timezone);
    const filters = parse(exportQuerySchema, {
      from: query.from || `${today.slice(0, 8)}01`,
      to: query.to || today,
      ...(query.type ? { type: query.type } : {}),
    });

    const dateRange: Prisma.DateTimeFilter = {
      gte: toDate(filters.from),
      lte: toDate(filters.to),
    };

    const entries = await this.db.financeEntry.findMany({
      where: {
        organizationId: orgId,
        ...(filters.type !== 'ALL' && { type: filters.type }),
        OR: [{ dueDate: dateRange }, { settledDate: dateRange }],
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
      select: entrySelect,
    });

    const locale = organization.locale || 'pt-BR';
    const isEn = locale === 'en-US';
    const isEs = locale === 'es-ES';
    const isPtPt = locale === 'pt-PT';
    const delimiter = isEn ? ',' : ';';
    const paymentLabels = isEn ? paymentMethodLabelsEn : isEs ? paymentMethodLabelsEs : isPtPt ? paymentMethodLabelsPtPt : paymentMethodLabelsPt;
    const statusLabels = isEn ? entryStatusLabelsEn : isEs ? entryStatusLabelsEs : isPtPt ? entryStatusLabelsPtPt : entryStatusLabelsPt;
    const header = (isEn ? [
      'Due date', 'Payment date', 'Type', 'Status', 'Description', 'Category', 'Patient', 'Professional',
      'Payment method', `Amount (${organization.currency})`, 'Reconciled',
    ] : isEs ? [
      'Fecha de vencimiento', 'Fecha de pago', 'Tipo', 'Estado', 'Descripción', 'Categoría', 'Paciente', 'Profesional',
      'Forma de pago', `Importe (${organization.currency})`, 'Conciliado',
    ] : isPtPt ? [
      'Data de vencimento', 'Data de pagamento', 'Tipo', 'Estado', 'Descrição', 'Categoria', 'Utente', 'Profissional',
      'Forma de pagamento', `Valor (${organization.currency})`, 'Conferido',
    ] : [
      'Vencimento', 'Data do caixa', 'Tipo', 'Situação', 'Descrição', 'Categoria', 'Paciente', 'Profissional',
      'Forma de pagamento', `Valor (${organization.currency})`, 'Conferido',
    ]).join(delimiter);

    const lines = entries.map((entry) => [
      formatDateCsv(entry.dueDate, locale),
      formatDateCsv(entry.settledDate, locale),
      isEn ? (entry.type === 'INCOME' ? 'Income' : 'Expense') : isEs ? (entry.type === 'INCOME' ? 'Ingreso' : 'Gasto') : (entry.type === 'INCOME' ? 'Receita' : 'Despesa'),
      statusLabels[entry.status],
      escapeCsvCell(entry.description, delimiter),
      escapeCsvCell(entry.category?.name ?? '', delimiter),
      escapeCsvCell(entry.patient?.name ?? '', delimiter),
      escapeCsvCell(entry.professional?.name ?? '', delimiter),
      entry.paymentMethod ? paymentLabels[entry.paymentMethod] : '',
      formatCentsCsv(entry.amountCents, locale),
      entry.reconciledAt ? (isEn ? 'Yes' : isEs ? 'Sí' : 'Sim') : (isEn ? 'No' : 'Não'),
    ].map((value) => escapeCsvCell(value, delimiter)).join(delimiter));

    const csv = `\uFEFF${[header, ...lines].join('\r\n')}`;
    const filename = `${isEn || isEs ? 'finance' : 'financeiro'}-${slugifyClinicName(organization.name)}-${filters.from}-${filters.to}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('entries')
  async listEntries(@Param('orgId') orgId: string, @Query() query: Record<string, string>, @Req() req: Request) {
    await this.access.clinic(req, orgId, financeReadRoles);
    const filters = parse(entriesQuerySchema, {
      ...(query.from && { from: query.from }),
      ...(query.to && { to: query.to }),
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
    });
    const dateRange: Prisma.DateTimeFilter = {
      ...(filters.from && { gte: toDate(filters.from) }),
      ...(filters.to && { lte: toDate(filters.to) }),
    };
    const hasRange = Boolean(filters.from || filters.to);
    const entries = await this.db.financeEntry.findMany({
      where: {
        organizationId: orgId,
        ...(filters.type && { type: filters.type }),
        ...(filters.status && { status: filters.status }),
        ...(hasRange && {
          OR: [
            { dueDate: dateRange },
            { settledDate: dateRange },
          ],
        }),
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: entrySelect,
    });
    return entries.map(serializeEntry);
  }

  @Post('entries')
  async createEntry(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, financeReadRoles);
    const input = parse(entryCreateInput, body);
    return this.db.$transaction(async (tx) => {
      if (input.categoryId) {
        const category = await tx.financeCategory.findFirst({
          where: { id: input.categoryId, organizationId: orgId },
          select: { id: true, type: true, active: true },
        });
        if (!category) throw new BadRequestException('Selecione uma categoria válida desta clínica.');
        if (!category.active) throw new BadRequestException('Esta categoria financeira está inativa.');
        if (category.type !== input.type) {
          throw new BadRequestException('A categoria selecionada não corresponde ao tipo do lançamento.');
        }
      }
      const created = await tx.financeEntry.create({
        data: {
          organizationId: orgId,
          type: input.type,
          description: input.description,
          amountCents: input.amountCents,
          dueDate: toDate(input.dueDate),
          categoryId: input.categoryId,
          patientId: input.patientId,
          professionalId: input.professionalId,
          notes: input.notes,
          createdById: user.id,
        },
        select: entrySelect,
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.created', resourceId: created.id },
      });
      return serializeEntry(created);
    });
  }

  @Patch('entries/:entryId')
  async updateEntry(
    @Param('orgId') orgId: string,
    @Param('entryId') entryKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeReadRoles);
    const entryId = parse(id, entryKey);
    const incoming = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const input = parse(entryUpdateInput, body);
    const changed = Object.keys(incoming).length > 0;
    if (!changed) throw new BadRequestException('Informe o que deseja alterar.');

    return this.db.$transaction(async (tx) => {
      const existing = await tx.financeEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        select: { id: true, status: true, type: true },
      });
      if (!existing) throw new NotFoundException('Lançamento financeiro indisponível.');
      if (existing.status !== 'PENDING') {
        throw new ConflictException('Somente lançamentos em aberto podem ser editados.');
      }
      if (Object.hasOwn(incoming, 'categoryId') && input.categoryId) {
        const category = await tx.financeCategory.findFirst({
          where: { id: input.categoryId, organizationId: orgId },
          select: { id: true, type: true, active: true },
        });
        if (!category) throw new BadRequestException('Selecione uma categoria válida desta clínica.');
        if (!category.active) throw new BadRequestException('Esta categoria financeira está inativa.');
        if (category.type !== existing.type) {
          throw new BadRequestException('A categoria selecionada não corresponde ao tipo do lançamento.');
        }
      }
      const updated = await tx.financeEntry.update({
        where: { id: entryId },
        data: {
          ...(input.description !== undefined && { description: input.description }),
          ...(input.amountCents !== undefined && { amountCents: input.amountCents }),
          ...(input.dueDate !== undefined && { dueDate: toDate(input.dueDate) }),
          ...(Object.hasOwn(incoming, 'categoryId') && { categoryId: input.categoryId }),
          ...(Object.hasOwn(incoming, 'patientId') && { patientId: input.patientId }),
          ...(Object.hasOwn(incoming, 'professionalId') && { professionalId: input.professionalId }),
          ...(Object.hasOwn(incoming, 'notes') && { notes: input.notes }),
        },
        select: entrySelect,
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.updated', resourceId: entryId },
      });
      return serializeEntry(updated);
    });
  }

  @Post('entries/:entryId/settle')
  async settleEntry(
    @Param('orgId') orgId: string,
    @Param('entryId') entryKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeReadRoles);
    const entryId = parse(id, entryKey);
    const input = parse(settleInput, body);

    return this.db.$transaction(async (tx) => {
      await lockCashDate(tx, orgId, input.settledDate);
      await assertDayOpen(tx, orgId, input.settledDate);
      const existing = await tx.financeEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        select: { id: true, status: true, notes: true },
      });
      if (!existing) throw new NotFoundException('Lançamento financeiro indisponível.');
      if (existing.status !== 'PENDING') {
        throw new ConflictException('Este lançamento não está em aberto para baixa.');
      }
      const settled = await tx.financeEntry.update({
        where: { id: entryId },
        data: {
          status: 'PAID',
          settledDate: toDate(input.settledDate),
          settledAt: new Date(),
          settledById: user.id,
          paymentMethod: input.paymentMethod,
          ...(input.notes !== null && input.notes !== undefined && { notes: input.notes }),
        },
        select: entrySelect,
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.settled', resourceId: entryId },
      });
      return serializeEntry(settled);
    });
  }

  @Post('entries/:entryId/reconcile')
  async reconcileEntry(
    @Param('orgId') orgId: string,
    @Param('entryId') entryKey: string,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeManageRoles);
    const entryId = parse(id, entryKey);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.financeEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        select: { id: true, status: true, settledDate: true, reconciledAt: true },
      });
      if (!existing) throw new NotFoundException('Lançamento financeiro indisponível.');
      if (existing.status !== 'PAID' || !existing.settledDate) {
        throw new ConflictException('Somente lançamentos já recebidos ou pagos podem ser reconciliados.');
      }
      if (existing.reconciledAt) {
        throw new ConflictException('Este lançamento já foi conferido.');
      }
      const day = formatDate(existing.settledDate)!;
      await lockCashDate(tx, orgId, day);
      await assertDayOpen(tx, orgId, day);

      const reconciled = await tx.financeEntry.update({
        where: { id: entryId },
        data: { reconciledAt: new Date(), reconciledById: user.id },
        select: entrySelect,
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.reconciled', resourceId: entryId },
      });
      return serializeEntry(reconciled);
    });
  }

  @Post('entries/:entryId/cancel')
  async cancelEntry(
    @Param('orgId') orgId: string,
    @Param('entryId') entryKey: string,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeManageRoles);
    const entryId = parse(id, entryKey);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.financeEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundException('Lançamento financeiro indisponível.');
      if (existing.status !== 'PENDING') {
        throw new ConflictException('Somente lançamentos em aberto podem ser cancelados.');
      }
      const cancelled = await tx.financeEntry.update({
        where: { id: entryId },
        data: { status: 'CANCELLED' },
        select: entrySelect,
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.entry.cancelled', resourceId: entryId },
      });
      return serializeEntry(cancelled);
    });
  }

  @Get('closings')
  async listClosings(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.access.clinic(req, orgId, financeReadRoles);
    const closings = await this.db.cashClosing.findMany({
      where: { organizationId: orgId },
      orderBy: { closingDate: 'desc' },
      take: 60,
      select: {
        id: true,
        closingDate: true,
        status: true,
        receivedCents: true,
        paidCents: true,
        netCents: true,
        reconciledCount: true,
        notes: true,
        closedAt: true,
        reopenedAt: true,
        reopenReason: true,
        closedBy: { select: { id: true, name: true } },
        reopenedBy: { select: { id: true, name: true } },
      },
    });
    return closings.map((row) => ({ ...row, closingDate: formatDate(row.closingDate)! }));
  }

  @Post('closings')
  async closeCash(@Param('orgId') orgId: string, @Body() body: unknown, @Req() req: Request) {
    const { user } = await this.access.clinic(req, orgId, financeManageRoles);
    const input = parse(closingCreateInput, body);
    const closingDate = toDate(input.closingDate);

    return this.db.$transaction(async (tx) => {
      await lockCashDate(tx, orgId, input.closingDate);
      const existing = await tx.cashClosing.findUnique({
        where: { organizationId_closingDate: { organizationId: orgId, closingDate } },
        select: { id: true, status: true },
      });
      if (existing?.status === 'CLOSED') {
        throw new ConflictException(`O caixa do dia ${input.closingDate} já está fechado.`);
      }

      const [stats] = await tx.$queryRaw<Array<{
        receivedCents: number;
        paidCents: number;
        reconciledCount: number;
        unreconciledCount: number;
      }>>`
        SELECT
          coalesce(sum("amountCents") FILTER (WHERE "type" = 'INCOME'), 0)::int AS "receivedCents",
          coalesce(sum("amountCents") FILTER (WHERE "type" = 'EXPENSE'), 0)::int AS "paidCents",
          count(*) FILTER (WHERE "reconciledAt" IS NOT NULL)::int AS "reconciledCount",
          count(*) FILTER (WHERE "reconciledAt" IS NULL)::int AS "unreconciledCount"
        FROM "FinanceEntry"
        WHERE "organizationId" = ${orgId}::uuid
          AND "status" = 'PAID'
          AND "settledDate" = ${input.closingDate}::date
      `;

      if ((stats?.unreconciledCount ?? 0) > 0) {
        throw new ConflictException(
          'Revise e reconcilie todos os lançamentos recebidos ou pagos deste dia antes de fechar o caixa.',
        );
      }

      const receivedCents = stats?.receivedCents ?? 0;
      const paidCents = stats?.paidCents ?? 0;
      const netCents = receivedCents - paidCents;
      const reconciledCount = stats?.reconciledCount ?? 0;

      const closing = existing
        ? await tx.cashClosing.update({
            where: { id: existing.id },
            data: {
              status: 'CLOSED',
              receivedCents,
              paidCents,
              netCents,
              reconciledCount,
              notes: input.notes,
              closedById: user.id,
              closedAt: new Date(),
              reopenedById: null,
              reopenedAt: null,
              reopenReason: null,
            },
            select: {
              id: true, closingDate: true, status: true, receivedCents: true, paidCents: true,
              netCents: true, reconciledCount: true, notes: true, closedAt: true,
              reopenedAt: true, reopenReason: true,
              closedBy: { select: { id: true, name: true } },
              reopenedBy: { select: { id: true, name: true } },
            },
          })
        : await tx.cashClosing.create({
            data: {
              organizationId: orgId,
              closingDate,
              status: 'CLOSED',
              receivedCents,
              paidCents,
              netCents,
              reconciledCount,
              notes: input.notes,
              closedById: user.id,
            },
            select: {
              id: true, closingDate: true, status: true, receivedCents: true, paidCents: true,
              netCents: true, reconciledCount: true, notes: true, closedAt: true,
              reopenedAt: true, reopenReason: true,
              closedBy: { select: { id: true, name: true } },
              reopenedBy: { select: { id: true, name: true } },
            },
          });

      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.cash.closed', resourceId: closing.id },
      });
      return { ...closing, closingDate: formatDate(closing.closingDate)! };
    });
  }

  @Post('closings/:closingId/reopen')
  async reopenCash(
    @Param('orgId') orgId: string,
    @Param('closingId') closingKey: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const { user } = await this.access.clinic(req, orgId, financeOwnerRoles);
    const closingId = parse(id, closingKey);
    const input = parse(closingReopenInput, body);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.cashClosing.findFirst({
        where: { id: closingId, organizationId: orgId },
        select: { id: true, closingDate: true, status: true },
      });
      if (!existing) throw new NotFoundException('Fechamento de caixa indisponível.');
      if (existing.status !== 'CLOSED') {
        throw new ConflictException('Este caixa já está reaberto.');
      }
      await lockCashDate(tx, orgId, formatDate(existing.closingDate)!);
      const reopened = await tx.cashClosing.update({
        where: { id: closingId },
        data: {
          status: 'REOPENED',
          reopenedById: user.id,
          reopenedAt: new Date(),
          reopenReason: input.reason,
        },
        select: {
          id: true, closingDate: true, status: true, receivedCents: true, paidCents: true,
          netCents: true, reconciledCount: true, notes: true, closedAt: true,
          reopenedAt: true, reopenReason: true,
          closedBy: { select: { id: true, name: true } },
          reopenedBy: { select: { id: true, name: true } },
        },
      });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: 'finance.cash.reopened', resourceId: closingId },
      });
      return { ...reopened, closingDate: formatDate(reopened.closingDate)! };
    });
  }
}
