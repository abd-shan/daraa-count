ALTER TYPE "MaritalStatus" ADD VALUE 'WIDOWED';
ALTER TYPE "MaritalStatus" ADD VALUE 'DIVORCED';

ALTER TABLE "CensusRecord" DROP CONSTRAINT "CensusRecord_marital_check";
-- Cast to text so newly added enum values need not be used before commit.
ALTER TABLE "CensusRecord" ADD CONSTRAINT "CensusRecord_marital_check" CHECK (
  ("category" = 'EXTREME_POVERTY' AND "maritalStatus" IS NULL) OR
  ("category" IN ('MARTYR', 'WAR_INJURED') AND "maritalStatus" IS NOT NULL AND (
    ("maritalStatus"::text = 'SINGLE' AND "spouseName" IS NULL) OR
    ("maritalStatus"::text = 'MARRIED' AND "spouseName" IS NOT NULL AND length(btrim("spouseName")) > 0) OR
    "maritalStatus"::text IN ('WIDOWED', 'DIVORCED')
  ))
);
