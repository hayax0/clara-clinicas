import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AssistantController } from './ai/assistant.js';
import { AiUsage } from './ai/usage.js';
import { createGeminiProvider, MODEL_PROVIDER } from './ai/gemini-provider.js';
import { Auth, AuthController } from './auth.js';
import { allowedWebOrigins } from './config.js';
import { Database, DatabaseErrorFilter } from './database.js';
import { Access, OrganizationsController, PlatformAdminController } from './organizations.js';
import { MarketingCampaignController } from './marketing-campaigns.js';
import { FinanceController } from './finance.js';
import { PackagesController } from './packages.js';
import { FollowUpsController } from './follow-ups.js';
import { ReminderController } from './reminders.js';
import { InboxController } from './inbox.js';
import { CaptureController, CaptureSettingsController } from './capture.js';
import { ResourcesController } from './resources.js';

@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}

  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  controllers: [HealthController, AuthController, OrganizationsController, PlatformAdminController, AssistantController, MarketingCampaignController, FinanceController, PackagesController, FollowUpsController, ReminderController, InboxController, CaptureController, CaptureSettingsController, ResourcesController],
  providers: [Database, Auth, Access, AiUsage, { provide: MODEL_PROVIDER, useFactory: () => createGeminiProvider() }],
})
class AppModule {}

async function main() {
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.useGlobalFilters(new DatabaseErrorFilter());
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const mutates = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const { origin } = request.headers;
    if (mutates && ((origin && !allowedWebOrigins.has(origin)) || request.headers['sec-fetch-site'] === 'cross-site')) {
      return response.status(403).json({ message: 'Origem da requisição não autorizada.' });
    }
    next();
  });
  await app.listen(Number(process.env.API_PORT ?? 4311), process.env.API_HOST ?? '127.0.0.1');
}

void main();
