-- Unknown family size is stored as NULL; supplied counts remain positive.
ALTER TABLE "CensusRecord" ALTER COLUMN "familyMembersCount" DROP NOT NULL;
