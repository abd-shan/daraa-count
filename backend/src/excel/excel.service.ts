import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { Prisma, CensusCategory } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import type { Actor } from '../auth/auth.types';
import { requireAdmin } from '../common/admin';
import { audit, municipalityLock } from '../common/audit';
import { parse, uuidSchema, categorySchema } from '../common/validation';
import { readConfig } from '../config';
import {
  categoryLabels,
  headers,
  maritalLabels,
  safeExcelText,
} from './headers';
import { parseWorkbook, validateUpload } from './workbook';
import type { ParsedRow, Upload } from './workbook';
const importSchema = z
  .object({ municipalityId: uuidSchema, category: categorySchema })
  .strict();
@Injectable()
export class ExcelService {
  private processing = 0;
  constructor(
    private readonly db: PrismaService,
    private readonly records: RecordsService,
  ) {}
  private async bounded<T>(work: () => Promise<T>): Promise<T> {
    if (this.processing >= 2)
      throw new HttpException(
        'الخادم يعالج ملفات أخرى حالياً. يرجى المحاولة بعد قليل',
        429,
      );
    this.processing++;
    try {
      return await work();
    } finally {
      this.processing--;
    }
  }
  private async prepare(actor: Actor, body: unknown, file: Upload | undefined) {
    requireAdmin(actor);
    const input = parse(importSchema, body);
    const config = readConfig();
    validateUpload(file, config.MAX_IMPORT_FILE_MB);
    await this.records.activeMunicipality(this.db, input.municipalityId);
    const parsed = await parseWorkbook(
      file,
      input.category,
      config.MAX_IMPORT_ROWS,
    );
    return { input, parsed, file };
  }
  private async duplicates(
    tx: Prisma.TransactionClient,
    municipalityId: string,
    category: CensusCategory,
    rows: ParsedRow[],
  ) {
    // Identity is the person/spouse name pair — for the poverty category the
    // husband and wife. A row is a duplicate only when BOTH names match an
    // active record in the same municipality and category, or an earlier row
    // in the same workbook. Every other row is a distinct household and is
    // imported, including one that repeats a national ID or a phone number.
    //
    // Both names are stored trimmed with runs of whitespace collapsed, so
    // comparing them for equality is reliable; no other normalization is
    // applied to a person's name.
    const pairKey = (personName: string, spouseName: string | null) =>
      personName + '\u0000' + (spouseName ?? '');
    // Query only the names this workbook contains, in bounded batches, so the
    // lookup grows with the upload and not with the municipality's history.
    const names = [...new Set(rows.map((r) => r.data.personName))];
    const taken = new Set<string>();
    for (let i = 0; i < names.length; i += 500) {
      const found = await tx.censusRecord.findMany({
        where: {
          municipalityId,
          category,
          deletedAt: null,
          personName: { in: names.slice(i, i + 500) },
        },
        select: { personName: true, spouseName: true },
      });
      for (const r of found) taken.add(pairKey(r.personName, r.spouseName));
    }
    const accepted: ParsedRow[] = [],
      duplicates: Array<{ row: number; message: string }> = [];
    for (const row of rows) {
      const key = pairKey(row.data.personName, row.data.spouseName ?? null);
      if (taken.has(key)) {
        duplicates.push({
          row: row.row,
          message:
            'سجل مكرر: الاسم الثلاثي واسم الزوجة مطابقان لسجل موجود؛ سيتم تجاوزه دون تعديل أي سجل سابق',
        });
        continue;
      }
      accepted.push(row);
      // Also catches a second identical pair further down the same workbook.
      taken.add(key);
    }
    return { accepted, duplicates };
  }
  preview(actor: Actor, body: unknown, file?: Upload) {
    requireAdmin(actor);
    return this.bounded(() => this.previewWorkbook(actor, body, file));
  }
  private async previewWorkbook(actor: Actor, body: unknown, file?: Upload) {
    const { input, parsed } = await this.prepare(actor, body, file);
    const { accepted, duplicates } = await this.duplicates(
      this.db,
      input.municipalityId,
      input.category,
      parsed.rows,
    );
    return {
      totalRows: parsed.totalRows,
      validRows: accepted.length,
      invalidRows: parsed.errors.length,
      duplicateRows: duplicates.length,
      errors: parsed.errors.slice(0, 100),
      warnings: [...duplicates, ...parsed.warnings].slice(0, 100),
      sample: accepted.slice(0, 20).map((r) => ({
        row: r.row,
        personName: r.data.personName,
        familyMembersCount: r.data.familyMembersCount,
      })),
      canConfirm: parsed.errors.length === 0,
    };
  }
  confirm(actor: Actor, body: unknown, file?: Upload) {
    requireAdmin(actor);
    return this.bounded(() => this.confirmWorkbook(actor, body, file));
  }
  private async confirmWorkbook(actor: Actor, body: unknown, file?: Upload) {
    // The original upload is parsed and validated on every confirm request.
    const {
      input,
      parsed,
      file: upload,
    } = await this.prepare(actor, body, file);
    if (parsed.errors.length)
      throw new BadRequestException({
        code: 'INVALID_WORKBOOK',
        message: 'لا يمكن استيراد ملف يحتوي أخطاء. صحح الملف ثم أعد المعاينة',
        errors: parsed.errors.slice(0, 100),
      });
    return this.db.$transaction(
      async (tx) => {
        await municipalityLock(tx, input.municipalityId, input.category);
        await this.records.activeMunicipality(tx, input.municipalityId);
        const { accepted, duplicates } = await this.duplicates(
          tx,
          input.municipalityId,
          input.category,
          parsed.rows,
        );
        // Chunk writes to keep SQL parameters bounded.
        for (let i = 0; i < accepted.length; i += 500) {
          await tx.censusRecord.createMany({
            data: accepted.slice(i, i + 500).map((r) => {
              const {
                municipalityId: _ignored,
                expectedUpdatedAt: _expected,
                ...data
              } = r.data;
              void _ignored;
              void _expected;
              return {
                ...data,
                municipalityId: input.municipalityId,
                createdById: actor.id,
              };
            }),
          });
        }
        const originalFileName = [...upload.originalname]
          .map((c) =>
            c === '/' || c === '\\' || c.charCodeAt(0) < 32 ? '_' : c,
          )
          .join('')
          .slice(0, 255);
        const batch = await tx.importBatch.create({
          data: {
            ...input,
            originalFileName,
            fileChecksum: createHash('sha256')
              .update(upload.buffer)
              .digest('hex'),
            totalRows: parsed.totalRows,
            validRows: accepted.length,
            invalidRows: 0,
            duplicateRows: duplicates.length,
            importedRows: accepted.length,
            createdById: actor.id,
          },
        });
        await audit(
          tx,
          actor,
          'IMPORT',
          'ImportBatch',
          batch.id,
          input.municipalityId,
          {
            category: input.category,
            importedRows: accepted.length,
            duplicateRows: duplicates.length,
          },
        );
        return {
          importedRows: accepted.length,
          duplicateRows: duplicates.length,
          batchId: batch.id,
        };
      },
      { maxWait: 10000, timeout: 60000 },
    );
  }
  export(actor: Actor, query: unknown) {
    return this.bounded(() => this.exportWorkbook(actor, query));
  }
  private async exportWorkbook(actor: Actor, query: unknown) {
    const { q, where } = this.records.filters(actor, query);
    if (!q.category || q.deleted === 'true')
      throw new BadRequestException('يجب اختيار فئة لتصدير السجلات النشطة');
    const limit = 50000;
    const workbook = new ExcelJS.Workbook();
    const sheets = new Map<
      string,
      { sheet: ExcelJS.Worksheet; count: number }
    >();
    let rowCount = 0,
      cursor: string | undefined;
    const columns = headers(q.category);
    const addSheet = (municipality: {
      id: string;
      name: string;
      areaName: string;
    }) => {
      const sheet = workbook.addWorksheet('بلدية ' + (sheets.size + 1));
      sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 5 }];
      sheet.addRow(['المنطقة: ' + safeExcelText(municipality.areaName)]);
      sheet.addRow(['المدينة - البلدية: ' + safeExcelText(municipality.name)]);
      sheet.addRow(['تاريخ التصدير: ' + new Date().toISOString().slice(0, 10)]);
      sheet.addRow([]);
      sheet.addRow(columns.map((c) => c[1]));
      sheet.columns.forEach((col, index) => {
        col.width = index === 1 ? 34 : 24;
        col.numFmt = '@';
      });
      sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF214E46' },
      };
      sheet.getRow(5).height = 32;
      sheet.autoFilter = {
        from: { row: 5, column: 1 },
        to: { row: 5, column: columns.length },
      };
      const item = { sheet, count: 0 };
      sheets.set(municipality.id, item);
      return item;
    };
    // A consistent snapshot prevents concurrent edits/deletion from skipping records.
    await this.db.$transaction(
      async (tx) => {
        for (;;) {
          const items = await tx.censusRecord.findMany({
            where,
            orderBy: { id: 'asc' },
            take: 500,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
              municipality: {
                select: { id: true, name: true, areaName: true },
              },
            },
          });
          if (!items.length) break;
          for (const item of items) {
            if (++rowCount > limit)
              throw new BadRequestException(
                'التصدير محدود بـ 50000 سجل. اختر بلدية أو ضيّق البحث',
              );
            const entry =
              sheets.get(item.municipalityId) ?? addSheet(item.municipality);
            const row = entry.sheet.addRow(
              columns.map(([key]) => {
                if (key === 'sequence') return ++entry.count;
                if (key === 'maritalStatus')
                  return item.maritalStatus
                    ? maritalLabels[item.maritalStatus]
                    : '';
                const value = item[key];
                return typeof value === 'string'
                  ? safeExcelText(value)
                  : (value ?? '');
              }),
            );
            row.alignment = {
              horizontal: 'right',
              vertical: 'middle',
              wrapText: true,
            };
            row.height = 26;
          }
          cursor = items[items.length - 1].id;
        }
        if (!sheets.size) {
          const municipalityId = this.records.scope(actor, q.municipalityId);
          const municipality = municipalityId
            ? await tx.municipality.findUnique({
                where: { id: municipalityId },
                select: { id: true, name: true, areaName: true },
              })
            : null;
          addSheet(
            municipality ?? {
              id: '',
              name: 'جميع البلديات',
              areaName: 'جميع المناطق',
            },
          );
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60000,
      },
    );
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await audit(
      this.db,
      actor,
      'EXPORT',
      'CensusRecord',
      undefined,
      this.records.scope(actor, q.municipalityId),
      {
        category: q.category,
        rowCount,
        allMunicipalities: !this.records.scope(actor, q.municipalityId),
      },
    );
    const municipalityName =
      actor.role === 'MUNICIPALITY'
        ? actor.municipality!.name
        : q.municipalityId
          ? 'البلدية المحددة'
          : 'جميع البلديات';
    return {
      buffer,
      filename: categoryLabels[q.category] + ' - ' + municipalityName + '.xlsx',
    };
  }
}
