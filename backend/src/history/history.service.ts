import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { requireAdmin } from '../common/admin';
import { parse, paginationSchema } from '../common/validation';
import type { Actor } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class HistoryService {
  constructor(private readonly db: PrismaService) {}
  async audit(actor: Actor, query: unknown) {
    requireAdmin(actor);
    const q = parse(
      paginationSchema
        .extend({ action: z.string().max(60).optional() })
        .strict(),
      query,
    );
    const where = { action: q.action };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          user: { select: { username: true } },
          municipality: { select: { name: true } },
        },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async imports(actor: Actor, query: unknown) {
    requireAdmin(actor);
    const q = parse(paginationSchema.strict(), query);
    const [items, total] = await this.db.$transaction([
      this.db.importBatch.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          createdBy: { select: { username: true } },
          municipality: { select: { name: true } },
        },
      }),
      this.db.importBatch.count(),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
