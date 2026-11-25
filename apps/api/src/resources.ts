import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database.js';
import { Prisma, type Role } from './generated/prisma/client.js';
import { Access } from './organizations.js';
import { email, id, name, parse } from './validation.js';

const optionalText = z.string().trim().max(300).nullish().transform((value) => value || null);
const optionalEmail = z.union([email, z.literal('')]).nullish().transform((value) => value || null);
const appointmentDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const resourceSet = {
  units: { table: 'Unit', orderBy: 'name', schema: z.strictObject({ name, address: optionalText }) },
  services: {
    table: 'Service', orderBy: 'name',
    schema: z.strictObject({
      name, durationMinutes: z.number().int().min(5).max(1440), priceCents: z.number().int().min(0).max(100_000_000),
    }),
  },
  professionals: {
    table: 'Professional', orderBy: 'name',
    schema: z.strictObject({ name, specialty: optionalText, email: optionalEmail }),
  },
  contacts: { table: 'Contact', orderBy: 'name', schema: z.strictObject({ leadStatus:z.enum(['NEW','CONTACTED','WAITING','DONE']).default('NEW'), followUpAt:z.union([appointmentDate,z.literal('')]).nullish().transform(v=>v || null), name, email: optionalEmail, phone: optionalText, source: z.enum(['REFERRAL','INSTAGRAM','GOOGLE','WHATSAPP','WEBSITE','OTHER','']).nullish().transform(v => v || null) }) },
  patients: { table: 'Patient', orderBy: 'name', schema: z.strictObject({ name, email: optionalEmail, phone: optionalText }) },
  opportunities: {
    table: 'Opportunity', orderBy: 'createdAt',
    schema: z.strictObject({
      title: name, contactId: id, stage: z.enum(['NEW', 'CONTACTED', 'BOOKED', 'WON', 'LOST']).default('NEW'),
    }),
    casts: { contactId: 'uuid', stage: '"OpportunityStage"' },
  },
  appointments: {
    table: 'Appointment', orderBy: 'startAt',
    schema: z.strictObject({
      patientId: id, professionalId: id, serviceId: id, unitId: id,
      startAt: appointmentDate, endAt: appointmentDate,
      reminderPhone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$|^$/, "Use DDI, DDD e número.").nullish().transform(v=>v?.replace(/^\+/, "") || null),
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
    }),
    casts: { patientId: 'uuid', professionalId: 'uuid', serviceId: 'uuid', unitId: 'uuid', status: '"AppointmentStatus"' },
  },
  tasks: {
    table: 'Task', orderBy: 'createdAt',
    schema: z.strictObject({
      title: name, status: z.enum(['OPEN', 'DONE']).default('OPEN'),
      dueAt: z.union([appointmentDate, z.literal('')]).nullish().transform((value) => value || null),
    }),
    casts: { status: '"TaskStatus"' },
  },
} satisfies Record<string, { table: string; orderBy: string; schema: z.ZodObject; casts?: Record<string, string> }>;

const writerRoles: Role[] = ['OWNER', 'MANAGER', 'STAFF'];
type Scalar = string | number | Date | null;
type Row = Record<string, Scalar> & { id: string };
type Resource = { table: string; orderBy: string; schema: z.ZodObject; casts?: Record<string, string> };

function resourceFor(key: string): Resource {
  if (!Object.hasOwn(resourceSet, key)) throw new NotFoundException('Recurso indisponível.');
  return resourceSet[key as keyof typeof resourceSet];
}

// SQL identifiers come from the declared resource schemas, never the request body.
function identifier(name: string) {
  return Prisma.raw(`"${name}"`);
}

function valueFor(resource: Resource, column: string, value: Scalar) {
  if (value instanceof Date) return Prisma.sql`${value.toISOString()}::timestamptz`;
  const cast = resource.casts?.[column];
  return cast ? Prisma.sql`${value}::${Prisma.raw(cast)}` : Prisma.sql`${value}`;
}

function fieldsFor(resource: Resource, body: unknown, partial: boolean) {
  const shape = resource.schema.shape;
  const allowedFields = partial ? resource.schema.partial() : resource.schema;
  const input = parse(allowedFields, body) as Record<string, Scalar>;
  const incoming = body as Record<string, unknown>;
  return Object.keys(shape).flatMap((column): [string, Scalar][] => {
    const value = input[column];
    return value === undefined || (partial && !Object.hasOwn(incoming, column)) ? [] : [[column, value]];
  });
}

@Controller('organizations/:orgId/:resourceKey')
export class ResourcesController {
  constructor(private readonly db: Database, private readonly access: Access) {}

  @Get()
  async list(@Param('orgId') orgId: string, @Param('resourceKey') key: string, @Req() request: Request) {
    await this.access.clinic(request, orgId);
    const resource = resourceFor(key);
    return this.db.$queryRaw<Row[]>(Prisma.sql`
      SELECT * FROM ${identifier(resource.table)} WHERE "organizationId" = ${orgId}::uuid
      ORDER BY ${identifier(resource.orderBy)}, "id"
    `);
  }

  @Post()
  async create(@Param('orgId') orgId: string, @Param('resourceKey') key: string, @Body() body: unknown, @Req() request: Request) {
    const { user } = await this.access.clinic(request, orgId, writerRoles);
    const resource = resourceFor(key);
    const entries = fieldsFor(resource, body, false);
    const columns = Prisma.join(entries.map(([column]) => identifier(column)));
    const values = Prisma.join(entries.map(([column, value]) => valueFor(resource, column, value)));
    return this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`
        INSERT INTO ${identifier(resource.table)} ("id", "organizationId", ${columns})
        VALUES (${randomUUID()}::uuid, ${orgId}::uuid, ${values}) RETURNING *
      `);
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: `${key}.create`, resourceId: row.id },
      });
      return row;
    });
  }

  @Patch(':recordId')
  async update(@Param('orgId') orgId: string, @Param('resourceKey') key: string, @Param('recordId') recordId: string,
    @Body() body: unknown, @Req() request: Request) {
    const { user } = await this.access.clinic(request, orgId, writerRoles);
    const resource = resourceFor(key);
    const record = parse(id, recordId);
    const entries = fieldsFor(resource, body, true);
    if (entries.length === 0) throw new BadRequestException('Informe o que deseja alterar.');
    const assignments = Prisma.join(entries.map(([column, value]) => Prisma.sql`${identifier(column)} = ${valueFor(resource, column, value)}`));
    return this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Row[]>(Prisma.sql`
        UPDATE ${identifier(resource.table)} SET ${assignments}
        WHERE "organizationId" = ${orgId}::uuid AND "id" = ${record}::uuid RETURNING *
      `);
      if (!row) throw new NotFoundException('Registro indisponível.');
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: `${key}.update`, resourceId: record },
      });
      return row;
    });
  }

  @Delete(':recordId')
  @HttpCode(204)
  async delete(@Param('orgId') orgId: string, @Param('resourceKey') key: string, @Param('recordId') recordId: string, @Req() request: Request) {
    const { user } = await this.access.clinic(request, orgId, writerRoles);
    const resource = resourceFor(key);
    const record = parse(id, recordId);
    await this.db.$transaction(async (tx) => {
      const removed = await tx.$executeRaw(Prisma.sql`
        DELETE FROM ${identifier(resource.table)} WHERE "organizationId" = ${orgId}::uuid AND "id" = ${record}::uuid
      `);
      if (!removed) throw new NotFoundException('Registro indisponível.');
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: user.id, action: `${key}.delete`, resourceId: record },
      });
    });
  }
}
