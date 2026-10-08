import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../auth/auth.types';
import { audit } from '../common/audit';
import { requireAdmin } from '../common/admin';
import {
  paginationSchema,
  parse,
  shortText,
  uuidSchema,
} from '../common/validation';
const municipalitySchema = z
  .object({
    name: shortText(150),
    areaName: shortText(150),
  })
  .strict();
const editSchema = z
  .object({
    name: shortText(150).optional(),
    areaName: shortText(150).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
@Injectable()
export class MunicipalitiesService {
  constructor(private readonly db: PrismaService) {}
  async list(actor: Actor, query: unknown) {
    requireAdmin(actor);
    const q = parse(
      paginationSchema
        .extend({ search: z.string().trim().max(100).optional() })
        .strict(),
      query,
    );
    const where = q.search
      ? {
          OR: ['name', 'areaName'].map((key) => ({
            [key]: { contains: q.search, mode: 'insensitive' as const },
          })),
        }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.municipality.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          _count: { select: { records: { where: { deletedAt: null } } } },
        },
      }),
      this.db.municipality.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async options(actor: Actor) {
    requireAdmin(actor);
    return this.db.municipality.findMany({
      take: 5000,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, areaName: true, isActive: true },
    });
  }
  async create(actor: Actor, body: unknown) {
    requireAdmin(actor);
    const input = parse(municipalitySchema, body);
    return this.db.$transaction(async (tx) => {
      await tx.area.upsert({
        where: { name: input.areaName },
        create: { name: input.areaName },
        update: {},
      });
      const municipality = await tx.municipality.create({
        data: { name: input.name, areaName: input.areaName },
      });
      await audit(
        tx,
        actor,
        'MUNICIPALITY_CREATE',
        'Municipality',
        municipality.id,
        municipality.id,
      );
      return municipality;
    });
  }
  async areas(actor: Actor) {
    requireAdmin(actor);
    const areas = await this.db.area.findMany({
      orderBy: { name: 'asc' },
      take: 5000,
      select: { name: true },
    });
    return areas
      .map((area) => area.name)
      .sort((a, b) => a.localeCompare(b, 'ar'));
  }
  async update(actor: Actor, id: string, body: unknown) {
    requireAdmin(actor);
    parse(uuidSchema, id);
    const input = parse(editSchema, body);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.municipality.findUnique({ where: { id } })))
        throw new NotFoundException('البلدية غير موجودة');
      if (input.areaName)
        await tx.area.upsert({
          where: { name: input.areaName },
          create: { name: input.areaName },
          update: {},
        });
      const item = await tx.municipality.update({ where: { id }, data: input });
      if (input.isActive === false)
        await tx.session.updateMany({
          where: { user: { municipalityId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await audit(
        tx,
        actor,
        input.isActive === false
          ? 'MUNICIPALITY_DISABLE'
          : 'MUNICIPALITY_UPDATE',
        'Municipality',
        id,
        id,
        { changedFields: Object.keys(input) },
      );
      return item;
    });
  }
}
