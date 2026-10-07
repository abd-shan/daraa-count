import * as ExcelJS from 'exceljs';
import { headers, maritalLabels, safeExcelText } from './headers';
import { parseWorkbook, validateUpload } from './workbook';
import type { Upload } from './workbook';
async function fixture(rows: ExcelJS.CellValue[][], labels?: string[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('بيانات');
  sheet.addRow(['المنطقة: درعا']);
  sheet.addRow([]);
  sheet.addRow(labels ?? headers('MARTYR').map((h) => h[1]));
  rows.forEach((row) => sheet.addRow(row));
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  return {
    buffer,
    originalname: 'بيانات.xlsx',
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
  } satisfies Upload;
}
const valid = [
  1,
  'أحمد سعيد حسين',
  'عازب',
  '',
  '٠٠١٢٣',
  '٠٠٤٥٦',
  '٣',
  '٠٩٤٤٠٠٠٠٠٠',
  'ملاحظات',
];
describe('Workbook parsing security', () => {
  it.each(['عازب', 'عازبة', 'عازبه', 'متزوج', 'متزوجة', 'متزوجه'])(
    'accepts %s with a blank family count',
    async (status) => {
      const married = status.startsWith('متزوج');
      const row = [...valid];
      row[2] = status;
      row[3] = married ? 'اسم الزوج' : '';
      row[6] = '';
      const parsed = await parseWorkbook(await fixture([row]), 'MARTYR', 10);
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows[0].data).toMatchObject({
        maritalStatus: married ? 'MARRIED' : 'SINGLE',
        familyMembersCount: null,
        nationalId: '00123',
      });
    },
  );
  it.each([
    ['أرمل', 'WIDOWED'],
    ['أرملة', 'WIDOWED'],
    ['ارمل', 'WIDOWED'],
    ['ارملة', 'WIDOWED'],
    ['ارمله', 'WIDOWED'],
    ['أرمله', 'WIDOWED'],
    ['مطلق', 'DIVORCED'],
    ['مطلقة', 'DIVORCED'],
    ['مطلقه', 'DIVORCED'],
    ...Object.entries(maritalLabels).map(([value, label]) => [label, value]),
  ])('imports %s including the exported label', async (status, expected) => {
    const row = [...valid];
    row[2] = status;
    row[3] = expected === 'MARRIED' ? 'اسم الزوج' : '';
    row[6] = '';
    const parsed = await parseWorkbook(await fixture([row]), 'MARTYR', 10);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].data.maritalStatus).toBe(expected);
  });
  it('finds Arabic headers after metadata, accepts explicit aliases and Arabic digits', async () => {
    const labels = headers('MARTYR').map((h) =>
      h[1]
        .replace('عدد أفراد الأسرة', 'عدد افراد الاسرة')
        .replace('عازب/متزوج', 'الحالة الاجتماعية')
        .replace('الشخصية', 'الشخصبة'),
    );
    const parsed = await parseWorkbook(
      await fixture([valid], labels),
      'MARTYR',
      10,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].data.nationalId).toBe('00123');
    expect(parsed.rows[0].data.familyMembersCount).toBe(3);
  });
  it('rejects unknown and ambiguous headers', async () => {
    const labels = headers('MARTYR').map((h) => h[1]);
    labels[5] = 'عمود خاطئ';
    await expect(
      parseWorkbook(await fixture([valid], labels), 'MARTYR', 10),
    ).rejects.toThrow();
    labels[5] = labels[4];
    await expect(
      parseWorkbook(await fixture([valid], labels), 'MARTYR', 10),
    ).rejects.toThrow();
  });
  it('rejects invalid archives and formats/sizes before parsing', async () => {
    const bad = {
      buffer: Buffer.from('not zip'),
      size: 7,
      originalname: 'bad.xlsx',
      mimetype: 'application/octet-stream',
    };
    await expect(parseWorkbook(bad, 'MARTYR', 10)).rejects.toThrow();
    expect(() =>
      validateUpload({ ...bad, originalname: 'bad.xlsm' }, 10),
    ).toThrow();
    expect(() =>
      validateUpload({ ...bad, mimetype: 'text/csv' }, 10),
    ).toThrow();
    expect(() =>
      validateUpload({ ...bad, size: 11 * 1024 * 1024 }, 10),
    ).toThrow();
  });
  it('enforces row limits and reports formula cells without using cached results', async () => {
    await expect(
      parseWorkbook(await fixture([valid, valid]), 'MARTYR', 1),
    ).rejects.toThrow();
    const formula = [...valid];
    formula[4] = { formula: '1+1', result: 2 } as unknown as string;
    const parsed = await parseWorkbook(await fixture([formula]), 'MARTYR', 10);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.rows).toHaveLength(0);
  });
  it('preserves numeric cells with explicit leading-zero format', async () => {
    const file = await fixture([
      [...valid.slice(0, 4), 123, ...valid.slice(5)],
    ]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    book.worksheets[0].getCell('E4').numFmt = '000000';
    file.buffer = Buffer.from(await book.xlsx.writeBuffer());
    file.size = file.buffer.length;
    const parsed = await parseWorkbook(file, 'MARTYR', 10);
    expect(parsed.rows[0].data.nationalId).toBe('000123');
  });
  it.each(['=CMD()', '+1', '-1', '@SUM(A1)', '  =1', '\t+1'])(
    'escapes export formula prefixes %s',
    (value) => expect(safeExcelText(value)).toBe("'" + value),
  );
  it('retains normal Arabic text', () =>
    expect(safeExcelText('أحمد')).toBe('أحمد'));
});
