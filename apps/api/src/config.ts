import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('Configure DATABASE_URL antes de iniciar a API.');
  return value;
}

export const allowedWebOrigins = new Set(
  (process.env.WEB_ORIGIN || 'http://localhost:4310,http://127.0.0.1:4310')
    .split(',').map((origin) => origin.trim()),
);
