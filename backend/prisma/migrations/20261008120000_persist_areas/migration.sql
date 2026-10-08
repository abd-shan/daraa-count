-- Keep saved area names independently of the municipality currently using them.
BEGIN;
CREATE TABLE "Area" (
  "name" VARCHAR(150) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Area_pkey" PRIMARY KEY ("name")
);

INSERT INTO "Area" ("name")
SELECT DISTINCT "areaName" FROM "Municipality";

ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_areaName_fkey"
  FOREIGN KEY ("areaName") REFERENCES "Area"("name")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Municipality_areaName_idx" ON "Municipality"("areaName");
COMMIT;
