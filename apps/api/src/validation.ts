import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequestException(result.error.issues.map((issue) => {
    const field = issue.path.join('.');
    return field ? `${field} — ${issue.message}` : issue.message;
  }).join(', '));
}

export const id = z.uuid('Identificador inválido.');
export const name = z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120);
export const email = z.email('Informe um e-mail válido.').max(254).transform((value) => value.toLowerCase());
export const currency = z.enum(['BRL', 'USD', 'EUR', 'GBP']);
export const locale = z.enum(['pt-BR', 'pt-PT', 'es-ES', 'en-US']);
export const uiLocale = z.enum(['pt-BR', 'en-US']);
export const countryCode = z.enum(['BR', 'PT', 'ES', 'US']);
export const timezone = z.string().max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return value === 'UTC' || value.includes('/');
  } catch {
    return false;
  }
}, 'Informe um fuso horário IANA válido.');
