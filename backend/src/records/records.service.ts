import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../auth/auth.types';
import { audit, municipalityLock } from '../common/audit';
import {
  digits,
  parse,
  recordQuerySchema,
  recordSchema,
  uuidSchema,
} from '../common/validation';
const publicRecord = {
  id: true,
  municipalityId: true,
  category: true,
  personName: true,
  maritalStatus: true,
  spouseName: true,
  nationalId: true,
  familyBookNumber: true,
  familyMembersCount: true,
  phone: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  municipality: { select: { name: true, areaName: true } },
} satisfies Prisma.CensusRecordSelect;
@Injectable()
export class RecordsService {
  constructor(private readonly db: PrismaService) {}
  scope(actor: Actor, requested?: string): string | undefined {
    if (actor.role === 'MUNICIPALITY') {
      if (!actor.municipalityId)
        throw new ForbiddenException('الحساب غير مرتبط ببلدية');
      return actor.municipalityId;
    }
    return requested;
  }
  filters(actor: Actor, query: unknown) {
    const q = parse(recordQuerySchema, query);
    if (q.deleted === 'true' && actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية');
    const search = q.search ? digits(q.search) : undefined;
    const where: Prisma.CensusRecordWhereInput = {
      municipalityId: this.scope(actor, q.municipalityId),
      category: q.category,
      maritalStatus: q.maritalStatus,
      deletedAt: q.deleted === 'true' ? { not: null } : null,
      ...(search
        ? {
            OR: ['personName', 'nationalId', 'familyBookNumber', 'phone'].map(
              (key) => ({ [key]: { contains: search, mode: 'insensitive' } }),
            ),
          }
        : {}),
    };
    return { q, where };
  }
  async list(actor: Actor, query: unknown) {
    const { q, where } = this.filters(actor, query);
    const [items, total] = await this.db.$transaction([
      this.db.censusRecord.findMany({
        where,
        select: publicRecord,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.censusRecord.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async get(
    actor: Actor,
    id: string,
    tx: Prisma.TransactionClient = this.db,
    deleted = false,
  ) {
    parse(uuidSchema, id);
    const item = await tx.censusRecord.findFirst({
      where: {
        id,
        municipalityId: this.scope(actor),
        deletedAt: deleted ? { not: null } : null,
      },
      select: publicRecord,
    });
    if (!item) throw new NotFoundException('السجل المطلوب غير موجود');
    return item;
  }
  async activeMunicipality(tx: Prisma.TransactionClient, id?: string) {
    if (!id) throw new BadRequestException('يجب اختيار البلدية');
    const municipality = await tx.municipality.findFirst({
      where: { id, isActive: true },
    });
    if (!municipality)
      throw new BadRequestException('البلدية غير موجودة أو معطلة');
    return municipality;
  }
  async ensureNoDuplicate(
    tx: Prisma.TransactionClient,
    municipalityId: string,
    category: import('@prisma/client').CensusCategory,
    nationalId: string | null,
    excludeId?: string,
  ) {
    if (
      nationalId &&
      (await tx.censusRecord.findFirst({
        where: {
          municipalityId,
          category,
          nationalId,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      }))
    )
      throw new ConflictException({
        code: 'DUPLICATE',
        message:
          'يوجد سجل بنفس رقم البطاقة ضمن هذه البلدية والفئة. راجع السجل الموجود قبل الإضافة',
      });
  }
  async create(actor: Actor, body: unknown) {
    const {
      municipalityId: requested,
      expectedUpdatedAt: _expected,
      ...data
    } = parse(recordSchema, body);
    void _expected;
    const municipalityId = this.scope(actor, requested);
    return this.db.$transaction(async (tx) => {
      const municipality = await this.activeMunicipality(tx, municipalityId);
      await municipalityLock(tx, municipality.id, data.category);
      await this.ensureNoDuplicate(
        tx,
        municipality.id,
        data.category,
        data.nationalId,
      );
      const item = await tx.censusRecord.create({
        data: {
          ...data,
          municipalityId: municipality.id,
          createdById: actor.id,
        },
        select: publicRecord,
      });
      await audit(
        tx,
        actor,
        'RECORD_CREATE',
        'CensusRecord',
        item.id,
        municipality.id,
        { category: data.category },
      );
      return item;
    });
  }
  async update(actor: Actor, id: string, body: unknown) {
    const {
      municipalityId: _requested,
      expectedUpdatedAt,
      ...data
    } = parse(recordSchema, body);
    void _requested;
    return this.db.$transaction(async (tx) => {
      const item = await this.get(actor, id, tx);
      await municipalityLock(tx, item.municipalityId, item.category);
      const current = await this.get(actor, id, tx);
      if (data.category !== current.category)
        throw new BadRequestException('لا يمكن تغيير نوع الإحصاء للسجل');
      if (
        expectedUpdatedAt &&
        current.updatedAt.toISOString() !== expectedUpdatedAt
      )
        throw new ConflictException({
          code: 'STALE_RECORD',
          message: 'تم تعديل السجل بواسطة مستخدم آخر. أعد فتح السجل قبل الحفظ',
        });
      await this.activeMunicipality(tx, current.municipalityId);
      await this.ensureNoDuplicate(
        tx,
        current.municipalityId,
        data.category,
        data.nationalId,
        id,
      );
      const changedFields = Object.keys(data).filter(
        (key) =>
          data[key as keyof typeof data] !== current[key as keyof typeof data],
      );
      const updated = await tx.censusRecord.update({
        where: { id },
        data: { ...data, updatedById: actor.id },
        select: publicRecord,
      });
      await audit(
        tx,
        actor,
        'RECORD_UPDATE',
        'CensusRecord',
        id,
        current.municipalityId,
        { changedFields, category: current.category },
      );
      return updated;
    });
  }
  async remove(actor: Actor, id: string, restore = false) {
    if (restore && actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية');
    return this.db.$transaction(async (tx) => {
      const original = await this.get(actor, id, tx, restore);
      await municipalityLock(tx, original.municipalityId, original.category);
      const item = await this.get(actor, id, tx, restore);
      if (restore) {
        await this.activeMunicipality(tx, item.municipalityId);
        await this.ensureNoDuplicate(
          tx,
          item.municipalityId,
          item.category,
          item.nationalId,
          id,
        );
      }
      await tx.censusRecord.update({
        where: { id },
        data: { deletedAt: restore ? null : new Date(), updatedById: actor.id },
      });
      await audit(
        tx,
        actor,
        restore ? 'RECORD_RESTORE' : 'RECORD_DELETE',
        'CensusRecord',
        id,
        item.municipalityId,
        { category: item.category },
      );
      return { message: restore ? 'تمت استعادة السجل' : 'تم حذف السجل' };
    });
  }
  async summary(actor: Actor) {
    const groups = await this.db.censusRecord.groupBy({
      by: ['category'],
      where: { municipalityId: this.scope(actor), deletedAt: null },
      _count: true,
    });
    return {
      counts: Object.fromEntries(groups.map((g) => [g.category, g._count])),
      municipalityCount:
        actor.role === 'SUPER_ADMIN'
          ? await this.db.municipality.count()
          : undefined,
    };
  }
}
