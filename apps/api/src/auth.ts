import {
  Body, Controller, Get, HttpCode, HttpException, HttpStatus, Injectable, NotFoundException, Patch, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Database } from './database.js';
import { demoAvailable, demoEmail, demoOrganizationId, demoUserId, provisionDemo } from './demo.js';
import { email, name, parse, uiLocale } from './validation.js';

const derive = promisify(scrypt);
const cookieName = 'clinicas_sid';
const sessionLengthMs = 7 * 24 * 60 * 60 * 1000;
const password = z.string().min(10, 'Use ao menos 10 caracteres.').max(128);
const loginInput = z.strictObject({ email, password });
const registerInput = loginInput.extend({ name });
const userFields = { id: true, name: true, email: true, isAdmin: true, uiLocale: true } as const;
const preferencesInput = z.strictObject({ uiLocale: uiLocale.nullable() });
const fallbackHash = '00000000000000000000000000000000.' + '00'.repeat(64);
const localRegistrationHosts = new Set(['localhost', '127.0.0.1', '::1']);

function localRegistrationAllowed(request: Request) {
  if (process.env.NODE_ENV === 'production') return false;

  const host = (request.get('x-forwarded-host') ?? request.get('host') ?? '').split(',')[0].trim().toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  const remoteAddress = request.socket.remoteAddress ?? '';

  return localRegistrationHosts.has(hostname)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.SESSION_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const;

function digest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function requestToken(request: Request) {
  return request.headers.cookie?.match(/(?:^|;\s*)clinicas_sid=([a-f\d]{64})(?:;|$)/)?.[1];
}

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}.${(await derive(value, salt, 64) as Buffer).toString('hex')}`;
}

async function verifyPassword(value: string, encoded: string) {
  const [salt, expected] = encoded.split('.');
  const actual = await derive(value, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

@Injectable()
export class Auth {
  private readonly attempts = new Map<string, { count: number; until: number }>();

  constructor(private readonly db: Database) {}

  throttle(request: Request, action: string, max: number) {
    const now = Date.now();
    const key = `${action}:${request.ip ?? 'unknown'}`;
    const current = this.attempts.get(key);
    if (current && current.until > now) {
      if (current.count >= max) throw new HttpException('Muitas tentativas. Aguarde um minuto.', HttpStatus.TOO_MANY_REQUESTS);
      current.count++;
      return;
    }
    for (const [entry, attempt] of this.attempts) {
      if (attempt.until <= now) this.attempts.delete(entry);
    }
    if (this.attempts.size >= 10_000) throw new HttpException('Tente novamente em instantes.', HttpStatus.TOO_MANY_REQUESTS);
    this.attempts.set(key, { count: 1, until: now + 60_000 });
  }

  async register(body: unknown, request: Request, response: Response) {
    const input = parse(registerInput, body);
    if (input.email === demoEmail) throw new UnauthorizedException('Endereço indisponível.');
    const user = await this.db.user.create({
      data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
      select: userFields,
    });
    await this.newSession(user.id, request, response);
    return { user };
  }

  async login(body: unknown, request: Request, response: Response) {
    const input = parse(loginInput, body);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, user?.passwordHash ?? fallbackHash);
    if (!valid || !user || user.id === demoUserId) throw new UnauthorizedException('E-mail ou senha incorretos.');
    await this.newSession(user.id, request, response);
    return { user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } };
  }

  async enterDemo(request: Request, response: Response) {
    if (!demoAvailable(request)) throw new NotFoundException('Demonstração indisponível.');
    this.throttle(request, 'demo', 12);
    await provisionDemo(this.db, await hashPassword(randomBytes(32).toString('hex')));
    await this.newSession(demoUserId, request, response, 60 * 60 * 1000);
  }

  private async newSession(userId: string, request: Request, response: Response, lengthMs = sessionLengthMs) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + lengthMs);
    const old = requestToken(request);
    await this.db.$transaction([
      ...(old ? [this.db.session.deleteMany({ where: { digest: digest(old) } })] : []),
      this.db.session.create({ data: { digest: digest(token), userId, expiresAt } }),
    ]);
    response.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
  }

  async requireUser(request: Request) {
    const token = requestToken(request);
    if (!token) throw new UnauthorizedException('Entre para continuar.');
    const session = await this.db.session.findUnique({
      where: { digest: digest(token) },
      include: { user: { select: userFields } },
    });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    const isDemo = session.user.id === demoUserId;
    if (isDemo && !demoAvailable(request)) throw new UnauthorizedException('Sessão de demonstração indisponível.');
    return { ...session.user, isDemo, isAdmin: !isDemo && session.user.isAdmin };
  }

  async session(request: Request) {
    const user = await this.requireUser(request);
    const memberships = user.isAdmin ? [] : await this.db.membership.findMany({
      where: { userId: user.id, organization: { status: 'ACTIVE' }, ...(user.isDemo && { organizationId: demoOrganizationId }) },
      select: { role: true, organization: { select: { id: true, name: true, countryCode: true, timezone: true, currency: true, locale: true } } },
      orderBy: { organization: { name: 'asc' } },
    });
    return { user, memberships };
  }

  async logout(request: Request, response: Response) {
    const token = requestToken(request);
    if (token) await this.db.session.deleteMany({ where: { digest: digest(token) } });
    response.clearCookie(cookieName, cookieOptions);
  }
}

@Controller()
export class AuthController {
  constructor(private readonly auth: Auth, private readonly db: Database) {}

  @Get('auth/demo')
  demoStatus(@Req() req: Request) {
    return { available: demoAvailable(req) };
  }

  @Post('auth/demo')
  @HttpCode(204)
  async demo(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.enterDemo(req, res);
  }

  @Post('auth/register')
  register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!localRegistrationAllowed(req)) throw new NotFoundException('Cadastro indisponível.');
    this.auth.throttle(req, 'register', 12);
    return this.auth.register(body, req, res);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.auth.throttle(req, 'login', 30);
    return this.auth.login(body, req, res);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req, res);
  }

  @Get('session')
  session(@Req() req: Request) {
    return this.auth.session(req);
  }

  @Patch('auth/preferences')
  async updatePreferences(@Body() body: unknown, @Req() req: Request) {
    const user = await this.auth.requireUser(req);
    const input = parse(preferencesInput, body);
    const updated = await this.db.user.update({
      where: { id: user.id },
      data: { uiLocale: input.uiLocale },
      select: userFields,
    });
    return { user: updated };
  }
}
