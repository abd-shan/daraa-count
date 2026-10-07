import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as yauzl from 'yauzl';
import type { CensusCategory } from '@prisma/client';
import { headerMap, headers, normalizeHeader } from './headers';
import type { ExcelField } from './headers';
import { digits, recordSchema } from '../common/validation';
import type { RecordInput } from '../common/validation';
export interface Upload {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
export interface RowIssue {
  row: number;
  message: string;
}
export interface ParsedRow {
  row: number;
  data: RecordInput;
}
export async function inspectZip(buffer: Buffer) {
  const limit = 50 * 1024 * 1024;
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new BadRequestException('الملف ليس مصنف XLSX صالحاً'));
          return;
        }
        let entries = 0,
          expanded = 0,
          actual = 0;
        const names = new Set<string>();
        let settled = false;
        const fail = () => {
          if (!settled) {
            settled = true;
            zip.close();
            reject(
              new BadRequestException(
                'الملف تالف أو يحتوي محتوى غير مسموح أو يتجاوز حد الحجم بعد فك الضغط',
              ),
            );
          }
        };
        zip.on('error', fail);
        zip.on('entry', (entry: yauzl.Entry) => {
          if (
            ++entries > 2000 ||
            entry.uncompressedSize > 20 * 1024 * 1024 ||
            (expanded += entry.uncompressedSize) > limit ||
            names.has(entry.fileName) ||
            /vbaProject|externalLinks|embeddings|activeX/i.test(entry.fileName)
          ) {
            fail();
            return;
          }
          names.add(entry.fileName);
          if (entry.fileName.endsWith('/')) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail();
              return;
            }
            const chunks: Buffer[] = [];
            stream.on('error', fail);
            stream.on('data', (chunk: Buffer) => {
              actual += chunk.length;
              if (actual > limit) {
                stream.destroy();
                fail();
                return;
              }
              if (/\.xml$|\.rels$/i.test(entry.fileName)) chunks.push(chunk);
            });
            stream.on('end', () => {
              const xml = Buffer.concat(chunks).toString('utf8');
              if (
                /<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject|TargetMode\s*=\s*["']External["']/i.test(
                  xml,
                )
              ) {
                fail();
                return;
              }
              if (!settled) zip.readEntry();
            });
          });
        });
        zip.on('end', () => {
          if (settled) return;
          if (
            !names.has('[Content_Types].xml') ||
            !names.has('xl/workbook.xml')
          ) {
            fail();
            return;
          }
          settled = true;
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}
export function validateUpload(
  file: Upload | undefined,
  maxMB: number,
): asserts file is Upload {
  if (
    !file ||
    !/\.xlsx$/i.test(file.originalname) ||
    ![
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      'application/zip',
    ].includes(file.mimetype)
  )
    throw new BadRequestException('يرجى اختيار ملف .xlsx فقط');
  if (
    file.buffer.length > maxMB * 1024 * 1024 ||
    file.size > maxMB * 1024 * 1024
  )
    throw new BadRequestException('حجم الملف يتجاوز الحد المسموح');
}
function cellText(
  cell: ExcelJS.Cell,
  identifier: boolean,
  warnings: RowIssue[],
  row: number,
): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    if (value.length > 2000)
      throw new Error('قيمة الخلية أطول من الحد المسموح');
    return value.trim();
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    if (identifier) {
      if (/^0+$/.test(cell.numFmt)) {
        if (cell.numFmt.length > 50)
          throw new Error('تنسيق المعرّف أطول من الحد المسموح');
        return String(value).padStart(cell.numFmt.length, '0');
      }
      warnings.push({
        row,
        message: 'معرّف أو هاتف مخزن كرقم؛ يرجى مراجعة الأصفار في الملف الأصلي',
      });
    }
    return String(value);
  }
  if (typeof value === 'object' && 'richText' in value) {
    if (value.richText.reduce((n, p) => n + p.text.length, 0) > 2000)
      throw new Error('قيمة الخلية أطول من الحد المسموح');
    return value.richText
      .map((p) => p.text)
      .join('')
      .trim();
  }
  throw new Error(
    'الخلايا يجب أن تحتوي نصاً أو أرقاماً صحيحة، ولا يُسمح بالصيغ أو الروابط',
  );
}
export async function parseWorkbook(
  file: Upload,
  category: CensusCategory,
  maxRows: number,
) {
  await inspectZip(file.buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('تعذر قراءة مصنف XLSX');
  }
  if (book.worksheets.length !== 1)
    throw new BadRequestException('يرجى رفع مصنف يحتوي ورقة واحدة فقط');
  const sheet = book.worksheets[0];
  if (sheet.rowCount > maxRows + 30 || sheet.columnCount > 30)
    throw new BadRequestException(
      'الملف يتجاوز الحد المسموح للصفوف أو الأعمدة',
    );
  const map = headerMap(category);
  let headerRow = 0;
  const columns = new Map<ExcelField, number>();
  for (let r = 1; r <= Math.min(30, sheet.rowCount); r++) {
    const values: string[] = [];
    sheet
      .getRow(r)
      .eachCell({ includeEmpty: true }, (cell) =>
        values.push(
          typeof cell.value === 'string' ? normalizeHeader(cell.value) : '',
        ),
      );
    if (values.filter((v) => map.has(v)).length < 2) continue;
    headerRow = r;
    const errors: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
      if (cell.value === null) return;
      if (typeof cell.value !== 'string') {
        errors.push('ترويسة غير صالحة');
        return;
      }
      const label = normalizeHeader(cell.value);
      if (!label) return;
      const key = map.get(label);
      if (!key || (key === 'maritalStatus' && category === 'EXTREME_POVERTY'))
        errors.push('عمود غير معروف: ' + cell.value.slice(0, 100));
      else if (columns.has(key))
        errors.push('عمود مكرر: ' + cell.value.slice(0, 100));
      else columns.set(key, col);
    });
    for (const [key, label] of headers(category))
      if (key !== 'sequence' && !columns.has(key))
        errors.push('عمود مطلوب: ' + label);
    if (errors.length) throw new BadRequestException(errors.join('، '));
    break;
  }
  if (!headerRow)
    throw new BadRequestException(
      'لم يتم العثور على الترويسات العربية المعتمدة ضمن أول 30 سطراً',
    );
  const rows: ParsedRow[] = [],
    errors: RowIssue[] = [],
    warnings: RowIssue[] = [];
  let totalRows = 0;
  const mappedColumns = new Set(columns.values());
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    let populated = false;
    row.eachCell((cell) => {
      if (
        cell.value !== null &&
        (typeof cell.value !== 'string' || cell.value.trim())
      )
        populated = true;
    });
    if (!populated) continue;
    if (++totalRows > maxRows)
      throw new BadRequestException('عدد الصفوف يتجاوز الحد المسموح');
    try {
      // Reject formula/object cells even in a sequence column or a column with no header.
      row.eachCell((cell, col) => {
        if (
          cell.value !== null &&
          (typeof cell.value !== 'string' || cell.value.trim()) &&
          !mappedColumns.has(col)
        )
          throw new Error('توجد بيانات في عمود بلا ترويسة معتمدة');
        if (
          typeof cell.value === 'object' &&
          cell.value !== null &&
          !('richText' in cell.value)
        )
          throw new Error(
            'لا يُسمح بالصيغ أو الروابط أو التواريخ داخل بيانات الإحصاء',
          );
      });
      const values: Record<string, unknown> = { category };
      for (const [field, col] of columns) {
        if (field === 'sequence') continue;
        const text = cellText(
          row.getCell(col),
          ['nationalId', 'familyBookNumber', 'phone'].includes(field),
          warnings,
          r,
        );
        values[field] =
          field === 'familyMembersCount'
            ? text
              ? Number(digits(text))
              : null
            : text;
      }
      const parsed = recordSchema.safeParse(values);
      if (!parsed.success)
        errors.push({
          row: r,
          message: parsed.error.issues.map((i) => i.message).join('، '),
        });
      else rows.push({ row: r, data: parsed.data });
    } catch (error) {
      errors.push({
        row: r,
        message: error instanceof Error ? error.message : 'بيانات غير صالحة',
      });
    }
  }
  if (!totalRows)
    throw new BadRequestException('الملف لا يحتوي بيانات للاستيراد');
  return { rows, errors, warnings, totalRows };
}
