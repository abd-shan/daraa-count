import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export const digits = (value: string) =>
  value.replace(/[٠-٩۰-۹]/g, (c) =>
    String(c.charCodeAt(0) - (c <= '٩' ? 1632 : 1776)),
  );
export const cleanText = (value: string) => value.trim().replace(/\s+/g, ' ');
export const categories = ['MARTYR', 'WAR_INJURED', 'EXTREME_POVERTY'] as const;
export const categorySchema = z.enum(categories, {
  error: 'نوع الإحصاء غير صحيح',
});
export const uuidSchema = z.uuid({ error: 'المعرّف غير صحيح' });
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'يرجى التحقق من البيانات',
      fields: Object.fromEntries(
        result.error.issues.map((i) => [i.path.join('.'), i.message]),
      ),
    });
  return result.data;
}
export const shortText = (max: number) =>
  z
    .string({ error: 'يجب إدخال نص' })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(1, 'هذا الحقل مطلوب')
        .max(max, 'النص أطول من الحد المسموح'),
    );
const optionalText = (max: number, numeric = false) =>
  z
    .string({ error: 'يجب إدخال نص' })
    .max(max, 'النص أطول من الحد المسموح')
    .nullish()
    .transform((v) =>
      v ? (numeric ? digits(v.trim()) : v.trim()) || null : null,
    );
/**
 * An optional person name. Normalized exactly like a required name — trimmed
 * with runs of whitespace collapsed — and nothing more: the entered spelling
 * is preserved. Keeping this identical to `shortText` is what lets the Excel
 * importer compare a person/spouse name pair for equality reliably.
 *
 * Deliberately not used for `notes`, where collapsing whitespace would lose
 * the writer's own formatting.
 */
const optionalName = (max: number) =>
  z
    .string({ error: 'يجب إدخال نص' })
    .max(max, 'النص أطول من الحد المسموح')
    .nullish()
    .transform((v) => (v ? cleanText(v) || null : null));
export const maritalStatuses = [
  'SINGLE',
  'MARRIED',
  'WIDOWED',
  'DIVORCED',
] as const;
export const maritalStatusSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    // Only status labels accept the historical final ه spelling; names are unchanged.
    const text = value.trim().replace(/ه$/, 'ة');
    if (['عازب', 'عازبة', 'أعزب', 'اعزب', 'عازب/عازبة'].includes(text))
      return 'SINGLE';
    if (['متزوج', 'متزوجة', 'متزوج/متزوجة'].includes(text)) return 'MARRIED';
    if (['أرمل', 'أرملة', 'ارمل', 'ارملة', 'أرمل/أرملة'].includes(text))
      return 'WIDOWED';
    if (['مطلق', 'مطلقة', 'مطلق/مطلقة'].includes(text)) return 'DIVORCED';
    return text;
  },
  z.enum(maritalStatuses, {
    error:
      'الحالة الاجتماعية يجب أن تكون عازب/عازبة أو متزوج/متزوجة أو أرمل/أرملة أو مطلق/مطلقة',
  }),
);
export const recordSchema = z
  .object({
    category: categorySchema,
    municipalityId: uuidSchema.optional(),
    personName: shortText(200),
    maritalStatus: maritalStatusSchema.nullish(),
    spouseName: optionalName(200),
    nationalId: optionalText(50, true),
    familyBookNumber: optionalText(50, true),
    familyMembersCount: z.preprocess(
      (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'string')
          return v.trim() ? Number(digits(v.trim())) : null;
        return v;
      },
      z
        .number({
          error: 'عدد أفراد الأسرة يجب أن يكون رقماً صحيحاً أكبر من صفر',
        })
        .int('عدد أفراد الأسرة يجب أن يكون عدداً صحيحاً')
        .min(1, 'عدد أفراد الأسرة يجب أن يكون أكبر من صفر')
        .max(10000, 'عدد أفراد الأسرة يتجاوز الحد المسموح')
        .nullable(),
    ),
    phone: optionalText(50, true),
    notes: optionalText(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.category !== 'EXTREME_POVERTY') {
      if (!v.maritalStatus)
        ctx.addIssue({
          code: 'custom',
          path: ['maritalStatus'],
          message: 'الحالة الاجتماعية مطلوبة',
        });
      if (v.maritalStatus === 'MARRIED' && !v.spouseName)
        ctx.addIssue({
          code: 'custom',
          path: ['spouseName'],
          message: 'اسم الزوجة مطلوب للمتزوج',
        });
    }
  })
  .transform((v) => ({
    ...v,
    maritalStatus:
      v.category === 'EXTREME_POVERTY' ? null : (v.maritalStatus ?? null),
    spouseName:
      v.maritalStatus === 'SINGLE' && v.category !== 'EXTREME_POVERTY'
        ? null
        : v.spouseName,
  }));
export type RecordInput = z.infer<typeof recordSchema>;
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const recordQuerySchema = paginationSchema
  .extend({
    category: categorySchema.optional(),
    maritalStatus: maritalStatusSchema.optional(),
    municipalityId: uuidSchema.optional(),
    search: z.string().trim().max(100).optional(),
    deleted: z.enum(['true', 'false']).default('false'),
  })
  .strict();
export const passwordSchema = z
  .string()
  .min(6, 'كلمة المرور يجب أن تكون 6 محرفاً على الأقل')
  .max(128, 'كلمة المرور طويلة جداً');
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_.-]{3,80}$/,
    'اسم المستخدم: 3 إلى 80 محرفاً من الحروف اللاتينية والأرقام و . _ -',
  );
