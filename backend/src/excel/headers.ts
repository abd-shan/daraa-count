import type { CensusCategory, MaritalStatus } from '@prisma/client';
export const maritalLabels: Record<MaritalStatus, string> = {
  SINGLE: 'عازب/عازبة',
  MARRIED: 'متزوج/متزوجة',
  WIDOWED: 'أرمل/أرملة',
  DIVORCED: 'مطلق/مطلقة',
};
export const categoryLabels: Record<CensusCategory, string> = {
  MARTYR: 'شهداء الثورة',
  WAR_INJURED: 'مصابو الحرب',
  EXTREME_POVERTY: 'الأشد فقراً',
};
export const personLabels: Record<CensusCategory, string> = {
  MARTYR: 'الاسم الثلاثي للشهيد',
  WAR_INJURED: 'الاسم الثلاثي للمصاب',
  EXTREME_POVERTY: 'الاسم الثلاثي للزوج',
};
export type ExcelField =
  | 'sequence'
  | 'personName'
  | 'maritalStatus'
  | 'spouseName'
  | 'nationalId'
  | 'familyBookNumber'
  | 'familyMembersCount'
  | 'phone'
  | 'notes';
const shared = [
  ['spouseName', 'الاسم الثلاثي للزوجة'],
  ['nationalId', 'رقم البطاقة الشخصية'],
  ['familyBookNumber', 'رقم دفتر العائلة'],
  ['familyMembersCount', 'عدد أفراد الأسرة'],
  ['phone', 'رقم الجوال'],
  ['notes', 'ملاحظات'],
] as const;
export function headers(
  category: CensusCategory,
): ReadonlyArray<readonly [ExcelField, string]> {
  return [
    ['sequence', 'تسلسل'],
    ['personName', personLabels[category]],
    ...(category === 'EXTREME_POVERTY'
      ? []
      : [['maritalStatus', 'عازب/متزوج'] as const]),
    ...shared,
  ];
}
export const normalizeHeader = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[\u200e\u200f\u061c\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ');
export function headerMap(category: CensusCategory) {
  const map = new Map(
    headers(category).map(([key, label]) => [normalizeHeader(label), key]),
  );
  map.set(normalizeHeader('الحالة الاجتماعية'), 'maritalStatus');
  map.set(normalizeHeader('رقم البطاقة الشخصبة'), 'nationalId');
  return map;
}
export function safeExcelText(value: string): string {
  // Prefix an apostrophe even when formula characters follow control/space characters.
  const first = [...value].find((c) => c.charCodeAt(0) > 31 && c.trim() !== '');
  return first && '=+-@'.includes(first) ? "'" + value : value;
}
