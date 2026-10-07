import { ForbiddenException } from '@nestjs/common';
import type { Actor } from '../auth/auth.types';
export function requireAdmin(actor: Actor) {
  if (actor.role !== 'SUPER_ADMIN')
    throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية');
}
