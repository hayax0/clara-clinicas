import {
  ArgumentsHost, BadRequestException, Catch, ConflictException, Injectable, OnModuleDestroy,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Response } from 'express';
import { Prisma, PrismaClient } from './generated/prisma/client.js';
import { databaseUrl } from './config.js';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl(), options: '-c timezone=UTC' }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseErrorFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const driver = error.meta?.driverAdapterError as { cause?: { originalCode?: string } } | undefined;
    const code = driver?.cause?.originalCode ?? (error.code === 'P2010' ? String(error.meta?.code) : error.code);
    if (code === '23P01' || code === 'P2004') {
      return response.status(409).json({ message: 'O profissional ou paciente já tem um atendimento nesse horário.' });
    }
    if (code === 'P2002' || code === '23505') {
      return response.status(409).json({ message: 'Já existe um cadastro com esses dados.' });
    }
    if (code === 'P2003' || code === '23503') {
      const method = host.switchToHttp().getRequest<{ method: string }>().method;
      const failure = method === 'DELETE'
        ? new ConflictException('Este registro está vinculado a outro cadastro.')
        : new BadRequestException('Selecione registros válidos desta clínica.');
      return response.status(failure.getStatus()).json({ message: failure.message });
    }
    if (code === '23514') {
      return response.status(400).json({ message: 'A data de término deve ser posterior ao início.' });
    }
    return response.status(500).json({ message: 'Não foi possível concluir a operação.' });
  }
}
