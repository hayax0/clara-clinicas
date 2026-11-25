-- Keep existing clinics in Brazil while making market explicit and independent
-- from the clinic's language, currency and timezone.
ALTER TABLE "Organization"
  ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BR';

-- A user's interface preference is independent from the clinic's business locale.
ALTER TABLE "User"
  ADD COLUMN "uiLocale" TEXT;
