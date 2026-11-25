import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import type { Role } from './generated/prisma/client.js';
import { Access } from './organizations.js';
import { id, name, parse } from './validation.js';

const writers: Role[] = ['OWNER', 'MANAGER', 'STAFF'];
const createInput = z.strictObject({ subject: name, contactId: id.optional() });
const actionInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('assign'), assigneeId: id }),
  z.strictObject({ kind: z.literal('contact'), contactId: id }),
  z.strictObject({ kind: z.literal('note'), text: z.string().trim().min(1).max(2000) }),
  z.strictObject({ kind: z.literal('close') }),
  z.strictObject({ kind: z.literal('reopen') }),
]);
const updateInput = z.strictObject({ version: z.number().int().positive(), action: actionInput });
const display = { select: { id: true, name: true } };
const include = { contact: display, assignee: display };

@Controller('organizations/:orgId/inbox')
export class InboxController {
  constructor(private readonly db: Database, private readonly access: Access) {}

  @Get()
  async list(@Param('orgId') organizationId: string, @Req() req: Request) {
    const { user } = await this.access.clinic(req, organizationId);
    const [threads, members, contacts] = await Promise.all([
      this.db.inboxThread.findMany({ where: { organizationId }, include, orderBy: { updatedAt: 'desc' } }),
      this.db.membership.findMany({ where: { organizationId, role: { in: writers } }, select: { user: display }, orderBy: { user: { name: 'asc' } } }),
      this.db.contact.findMany({ where: { organizationId }, ...display, orderBy: { name: 'asc' } }),
    ]);
    return { threads, members: members.map(m => m.user), contacts, me: user.id };
  }

  @Get(':id')
  async detail(@Param('orgId') organizationId: string, @Param('id') threadId: string, @Req() req: Request) {
    await this.access.clinic(req, organizationId);
    const thread = await this.db.inboxThread.findFirst({ where: { id: parse(id, threadId), organizationId },
      include: { ...include, events: { orderBy: { version: 'asc' } } } });
    if (!thread) throw new NotFoundException('Atendimento indisponível.');
    return thread;
  }

  @Post()
  async create(@Param('orgId') organizationId: string, @Req() req: Request, @Body() body: unknown) {
    const { user } = await this.access.clinic(req, organizationId, writers);
    const input = parse(createInput, body);
    return this.db.inboxThread.create({ data: { organizationId, ...input, events: { create: {
      version: 1, actor: user.name, actorId: user.id, text: 'Abriu o atendimento.',
    } } } });
  }

  @Patch(':id')
  async edit(@Param('orgId') organizationId: string, @Param('id') threadId: string, @Req() req: Request, @Body() body: unknown) {
    const { user } = await this.access.clinic(req, organizationId, writers);
    const { version, action } = parse(updateInput, body);
    const where = { id: parse(id, threadId), organizationId };
    return this.db.$transaction(async tx => {
      const current = await tx.inboxThread.findFirst({ where });
      if (!current) throw new NotFoundException('Atendimento indisponível.');
      if (current.closed !== (action.kind === 'reopen')) throw new ConflictException('Verifique o status do atendimento.');
      const changes: { assigneeId?: string; contactId?: string; closed?: boolean } = {};
      let text: string;
      switch (action.kind) {
        case 'assign': {
          const target = await tx.membership.findFirst({ where: { organizationId, userId: action.assigneeId, role: { in: writers } }, select: { user: display } });
          if (!target) throw new NotFoundException('Responsável indisponível.');
          changes.assigneeId = target.user.id;
          text = user.id === target.user.id ? 'Assumiu o atendimento.' : 'Transferiu o atendimento para '+target.user.name+'.';
          break;
        }
        case 'contact': {
          const contact = await tx.contact.findFirst({ where: { organizationId, id: action.contactId }, ...display });
          if (!contact) throw new NotFoundException('Contato indisponível.');
          changes.contactId = contact.id;
          text = 'Vinculou o contato '+contact.name+'.';
          break;
        }
        case 'close': changes.closed = true; text = 'Concluiu o atendimento.'; break;
        case 'reopen': changes.closed = false; text = 'Reabriu o atendimento.'; break;
        case 'note': text = 'Anotação interna — '+action.text; break;
      }
      const result = await tx.inboxThread.updateMany({ where: { ...where, version }, data: { ...changes, version: { increment: 1 } } });
      if (!result.count) throw new ConflictException('Outra pessoa atualizou esta conversa. Confira o histórico antes de tentar de novo.');
      return tx.inboxEvent.create({ data: { threadId, version: version+1, text, actor: user.name, actorId: user.id } });
    });
  }
}
