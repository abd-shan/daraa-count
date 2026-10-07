import { Prisma } from '@prisma/client';
import type { Request } from 'express';
export const actorSelect = {
  id: true,
  username: true,
  role: true,
  municipalityId: true,
  isActive: true,
  municipality: {
    select: { id: true, name: true, areaName: true, isActive: true },
  },
} satisfies Prisma.UserSelect;
export type Actor = Prisma.UserGetPayload<{ select: typeof actorSelect }>;
export interface AuthRequest extends Request {
  actor: Actor;
  sessionId: string;
  cookies: Record<string, string | undefined>;
}
