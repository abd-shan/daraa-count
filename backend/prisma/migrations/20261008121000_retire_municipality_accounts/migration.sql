-- Keep user rows for record ownership and historical audits; end their access.
BEGIN;
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "municipalityId", "metadata")
SELECT gen_random_uuid(), 'USER_DISABLE', 'User', "id", "municipalityId",
  '{"reason":"municipality_accounts_retired"}'::jsonb
FROM "User" WHERE "role" = 'MUNICIPALITY' AND "isActive" = true;

UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL AND "userId" IN (
  SELECT "id" FROM "User" WHERE "role" = 'MUNICIPALITY'
);

UPDATE "User" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'MUNICIPALITY';
COMMIT;
