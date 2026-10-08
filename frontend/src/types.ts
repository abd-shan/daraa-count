export type Category = "MARTYR" | "WAR_INJURED" | "EXTREME_POVERTY";
export type MaritalStatus = "SINGLE" | "MARRIED" | "WIDOWED" | "DIVORCED";
export interface MunicipalityOption {
  id: string;
  name: string;
  areaName: string;
  isActive: boolean;
}
export interface User {
  id: string;
  username: string;
  role: "SUPER_ADMIN" | "MUNICIPALITY";
  municipalityId: string | null;
  municipality: MunicipalityOption | null;
}
export interface CensusRecord {
  id: string;
  municipalityId: string;
  category: Category;
  personName: string;
  maritalStatus: MaritalStatus | null;
  spouseName: string | null;
  nationalId: string | null;
  familyBookNumber: string | null;
  familyMembersCount: number | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  municipality: { name: string; areaName: string };
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Municipality extends MunicipalityOption {
  _count: { records: number };
}
export interface Summary {
  counts: Partial<Record<Category, number>>;
  municipalityCount?: number;
}
export interface RowIssue {
  row: number;
  message: string;
}
export interface ImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  sample: {
    row: number;
    personName: string;
    familyMembersCount: number | null;
  }[];
  canConfirm: boolean;
}
export interface ImportResult {
  importedRows: number;
  duplicateRows: number;
  batchId: string;
}
export interface ImportBatch {
  id: string;
  originalFileName: string;
  category: Category;
  municipality: { name: string };
  createdBy: { username: string };
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  createdAt: string;
}
export interface AuditEntry {
  id: string;
  action: string;
  user: { username: string } | null;
  municipality: { name: string } | null;
  entityId: string | null;
  metadata: {
    changedFields?: string[];
    category?: Category;
    rowCount?: number;
    importedRows?: number;
    duplicateRows?: number;
  } | null;
  createdAt: string;
}
export const categories: Category[] = [
  "MARTYR",
  "WAR_INJURED",
  "EXTREME_POVERTY",
];
export const categoryLabels: Record<Category, string> = {
  MARTYR: "شهداء الثورة",
  WAR_INJURED: "مصابو الحرب",
  EXTREME_POVERTY: "الأشد فقراً",
};
export const personLabels: Record<Category, string> = {
  MARTYR: "الاسم الثلاثي للشهيد",
  WAR_INJURED: "الاسم الثلاثي للمصاب",
  EXTREME_POVERTY: "الاسم الثلاثي للزوج",
};
export const categoryPaths: Record<Category, string> = {
  MARTYR: "/martyrs",
  WAR_INJURED: "/injured",
  EXTREME_POVERTY: "/poverty",
};
export const maritalLabels: Record<MaritalStatus, string> = {
  SINGLE: "عازب/عازبة",
  MARRIED: "متزوج/متزوجة",
  WIDOWED: "أرمل/أرملة",
  DIVORCED: "مطلق/مطلقة",
};
export const normalizeDigits = (v: string) =>
  v.replace(/[٠-٩۰-۹]/g, (c) =>
    String(c.charCodeAt(0) - (c <= "٩" ? 1632 : 1776)),
  );
// Arabic wording with Western digits. Identifiers, family counts and the Excel
// exports all use Western digits, so the interface stays readable next to them.
const locale = "ar-SY-u-nu-latn";
export const numberText = (value: number) => value.toLocaleString(locale);
export const dateText = (value: string) =>
  new Date(value).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
