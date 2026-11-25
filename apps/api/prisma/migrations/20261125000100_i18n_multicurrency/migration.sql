-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'pt-BR';
