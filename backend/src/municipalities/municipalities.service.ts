import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../auth/auth.types';
import { audit } from '../common/audit';
import { requireAdmin } from '../common/admin';
import {
  paginationSchema,
  parse,
  passwordSchema,
  shortText,
  usernameSchema,
  uuidSchema,
} from '../common/validation';
const municipalitySchema = z
  .object({
    name: shortText(150),
    areaName: shortText(150),
    username: usernameSchema,
    password: passwordSchema,
  })
  .strict();
const editSchema = z
  .object({
    name: shortText(150).optional(),
    areaName: shortText(150).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
const accountSchema = z
  .object({ username: usernameSchema, password: passwordSchema })
  .strict();
const userEditSchema = z
  .object({
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .strict();
const userSelect = {
  id: true,
  username: true,
  isActive: true,
  lastLoginAt: true,
};
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
      ? { name: { contains: q.search, mode: 'insensitive' as const } }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.municipality.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          users: { select: userSelect, orderBy: { createdAt: 'asc' } },
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
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    return this.db.$transaction(async (tx) => {
      const municipality = await tx.municipality.create({
        data: { name: input.name, areaName: input.areaName },
      });
      const user = await tx.user.create({
        data: {
          municipalityId: municipality.id,
          role: 'MUNICIPALITY',
          username: input.username,
          passwordHash,
        },
        select: userSelect,
      });
      await audit(
        tx,
        actor,
        'MUNICIPALITY_CREATE',
        'Municipality',
        municipality.id,
        municipality.id,
      );
      await audit(tx, actor, 'USER_CREATE', 'User', user.id, municipality.id);
      return { ...municipality, users: [user] };
    });
  }
  async update(actor: Actor, id: string, body: unknown) {
    requireAdmin(actor);
    parse(uuidSchema, id);
    const input = parse(editSchema, body);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.municipality.findUnique({ where: { id } })))
        throw new NotFoundException('البلدية غير موجودة');
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
  async createAccount(actor: Actor, municipalityId: string, body: unknown) {
    requireAdmin(actor);
    parse(uuidSchema, municipalityId);
    const input = parse(accountSchema, body);
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.municipality.findUnique({ where: { id: municipalityId } }))
      )
        throw new NotFoundException('البلدية غير موجودة');
      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          municipalityId,
          role: 'MUNICIPALITY',
        },
        select: userSelect,
      });
      await audit(tx, actor, 'USER_CREATE', 'User', user.id, municipalityId);
      return user;
    });
  }
  async updateAccount(actor: Actor, id: string, body: unknown) {
    requireAdmin(actor);
    parse(uuidSchema, id);
    const input = parse(userEditSchema, body);
    const passwordHash = input.password
      ? await argon2.hash(input.password, { type: argon2.argon2id })
      : undefined;
    return this.db.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id, role: 'MUNICIPALITY' },
        select: { municipalityId: true },
      });
      if (!current) throw new NotFoundException('الحساب غير موجود');
      const user = await tx.user.update({
        where: { id },
        data: { isActive: input.isActive, passwordHash },
        select: userSelect,
      });
      if (passwordHash || input.isActive === false)
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      if (passwordHash)
        await audit(
          tx,
          actor,
          'PASSWORD_RESET',
          'User',
          id,
          current.municipalityId,
        );
      if (input.isActive !== undefined)
        await audit(
          tx,
          actor,
          input.isActive ? 'USER_ENABLE' : 'USER_DISABLE',
          'User',
          id,
          current.municipalityId,
        );
      return user;
    });
  }
}
