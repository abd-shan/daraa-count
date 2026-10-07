import { Prisma } from '@prisma/client';
import type { Actor } from '../auth/auth.types';
export function audit(
  tx: Prisma.TransactionClient,
  actor: Actor | null,
  action: string,
  entityType?: string,
  entityId?: string,
  municipalityId?: string | null,
  metadata?: Prisma.InputJsonObject,
) {
  return tx.auditLog.create({
    data: {
      userId: actor?.id,
      municipalityId: municipalityId ?? actor?.municipalityId,
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}
export async function municipalityLock(
  tx: Prisma.TransactionClient,
  municipalityId: string,
  category: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${municipalityId + ':' + category}))`;
}
