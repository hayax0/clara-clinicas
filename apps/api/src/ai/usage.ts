import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { ModelUsage } from '@clinicas/ai-core';
import { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';

type ReserveInput = {
  organizationId: string;
  actorId: string;
  agentId: string;
  estimatedTokens: number;
  estimatedCalls: number;
};

type FinishInput = {
  status: 'COMPLETED' | 'FAILED' | 'BLOCKED';
  tool?: string;
  usage?: ModelUsage & { attempts?: number };
};

const maxDatabaseInt = 2_147_483_647;

function counter(value?: number): number | null {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= maxDatabaseInt ? value : null;
}

function quotaLimit(setting: string | undefined, defaultValue: number) {
  const value = setting?.trim();
  if (!value) return defaultValue;
  return /^\d+$/.test(value) ? counter(Number(value)) ?? 0 : 0;
}

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new NotFoundException('Clínica não encontrada.');
}

function paidRates(modelId: string | undefined, startedAt: Date) {
  // Standard paid Gemini API rates in USD per 1M tokens from https://aistudio.google.com/docs/pricing.
  switch (modelId) {
    case 'gemini-3.5-flash-lite':
      return { input: 0.30, cached: 0.03, output: 2.50 };
    case 'gemini-3.8-flash':
      return startedAt >= new Date('2027-01-01T00:00:00.000Z')
        ? { input: 1.50, cached: 0.15, output: 7.50 }
        : { input: 0.75, cached: 0.075, output: 3.75 };
    default:
      return null;
  }
}

@Injectable()
export class AiUsage {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  reserve({ organizationId, actorId, agentId, estimatedTokens, estimatedCalls }: ReserveInput) {
    if (!counter(estimatedTokens) || !counter(estimatedCalls)) {
      throw new RangeError('A reserva de IA exige contagens positivas.');
    }
    const tokenLimit = quotaLimit(process.env.GEMINI_DAILY_TOKEN_LIMIT, 60_000);
    const callLimit = quotaLimit(process.env.GEMINI_DAILY_CALL_LIMIT, 60);
    return this.db.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      // Read the database clock after acquiring the lock in case the UTC day changed while waiting.
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const createdAt = clock.now;
      const quotaDay = new Date(createdAt);
      quotaDay.setUTCHours(0, 0, 0, 0);
      const { _sum } = await tx.aiExecution.aggregate({
        where: { organizationId, quotaDay },
        _sum: { accountedTokens: true, accountedCalls: true },
      });
      if ((_sum.accountedTokens ?? 0) + estimatedTokens > tokenLimit
        || (_sum.accountedCalls ?? 0) + estimatedCalls > callLimit) {
        throw new HttpException('Cota diária de IA da clínica atingida.', HttpStatus.TOO_MANY_REQUESTS);
      }

      return tx.aiExecution.create({
        data: {
          organizationId, actorId, agentId, quotaDay, createdAt,
          reservedTokens: estimatedTokens,
          reservedCalls: estimatedCalls,
          accountedTokens: estimatedTokens,
          accountedCalls: estimatedCalls,
        },
        select: { id: true },
      });
    }, { isolationLevel: 'ReadCommitted' });
  }

  async finish(id: string, { status, tool, usage }: FinishInput) {
    await this.db.$transaction(async (tx) => {
      const execution = await tx.aiExecution.findUnique({
        where: { id },
        select: { organizationId: true, status: true, reservedCalls: true, reservedTokens: true, createdAt: true },
      });
      if (!execution || execution.status !== 'RESERVED') return;
      await lockOrganization(tx, execution.organizationId);
      const attempts = counter(usage?.attempts);
      const inputTokens = counter(usage?.inputTokens);
      const outputTokens = counter(usage?.outputTokens);
      const thinkingTokens = counter(usage?.thinkingTokens);
      const cachedInputTokens = counter(usage?.cachedInputTokens);
      const knownTokens = inputTokens !== null && outputTokens !== null
        ? Math.min(maxDatabaseInt, inputTokens + outputTokens + (thinkingTokens ?? 0))
        : null;

      const accountedTokens = attempts === 1 && knownTokens !== null
        ? knownTokens
        : Math.max(execution.reservedTokens, knownTokens ?? 0);

      const rates = paidRates(usage?.modelId, execution.createdAt);
      const cached = Math.min(inputTokens ?? 0, cachedInputTokens ?? 0);
      const estimatedCostUsd = rates && attempts === 1 && inputTokens !== null && outputTokens !== null
        ? ((inputTokens - cached) * rates.input + cached * rates.cached + (outputTokens + (thinkingTokens ?? 0)) * rates.output) / 1_000_000
        : null;

      await tx.aiExecution.updateMany({
        where: { id, status: 'RESERVED' },
        data: {
          status, tool, attempts, inputTokens, outputTokens, thinkingTokens, cachedInputTokens, estimatedCostUsd,
          modelId: usage?.modelId,
          latencyMs: counter(usage?.latencyMs),
          accountedTokens,
          accountedCalls: attempts ?? execution.reservedCalls,
          finishedAt: new Date(),
        },
      });
    }, { isolationLevel: 'ReadCommitted' });
  }

  history(organizationId: string, actorId: string) {
    return this.db.aiExecution.findMany({
      where: { organizationId, actorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
      select: { id: true, agentId: true, tool: true, status: true, createdAt: true },
    });
  }
}
