-- CreateIndex
CREATE INDEX "User_municipalityId_idx" ON "User"("municipalityId");

-- Prisma does not represent PostgreSQL CHECK constraints in its schema DSL.
-- Keep these protections in migration history; do not edit the applied init.
ALTER TABLE "User" ADD CONSTRAINT "User_role_municipality_check" CHECK (
  ("role" = 'SUPER_ADMIN' AND "municipalityId" IS NULL) OR
  ("role" = 'MUNICIPALITY' AND "municipalityId" IS NOT NULL)
);
ALTER TABLE "CensusRecord" ADD CONSTRAINT "CensusRecord_family_count_check"
  CHECK ("familyMembersCount" BETWEEN 1 AND 10000);
ALTER TABLE "CensusRecord" ADD CONSTRAINT "CensusRecord_name_check"
  CHECK (length(btrim("personName")) > 0);
ALTER TABLE "CensusRecord" ADD CONSTRAINT "CensusRecord_marital_check" CHECK (
  ("category" = 'EXTREME_POVERTY' AND "maritalStatus" IS NULL) OR
  ("category" IN ('MARTYR', 'WAR_INJURED') AND "maritalStatus" IS NOT NULL AND (
    ("maritalStatus" = 'SINGLE' AND "spouseName" IS NULL) OR
    ("maritalStatus" = 'MARRIED' AND "spouseName" IS NOT NULL AND length(btrim("spouseName")) > 0)
  ))
);
