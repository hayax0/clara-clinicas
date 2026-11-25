CREATE FUNCTION revoke_changed_contact_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."marketingConsentAt" IS NOT NULL AND OLD."marketingRevokedAt" IS NULL AND
     (NEW.email IS DISTINCT FROM OLD.email OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
    NEW."marketingRevokedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contact_consent_destination BEFORE UPDATE OF email, phone ON "Contact"
FOR EACH ROW EXECUTE FUNCTION revoke_changed_contact_consent();
