import { useState } from "react";
import { useAuditQuery } from "../api";
import type { AuditEntry } from "../types";
import { categoryLabels, dateText, numberText } from "../types";
import {
  EmptyState,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Pagination,
} from "../components/ui";
const actionLabels: Record<string, string> = {
  LOGIN: "دخول",
  LOGIN_FAILED: "محاولة دخول غير ناجحة",
  LOGOUT: "خروج",
  RECORD_CREATE: "إضافة سجل",
  RECORD_UPDATE: "تعديل سجل",
  RECORD_DELETE: "حذف سجل",
  RECORD_RESTORE: "استعادة سجل",
  EXPORT: "تصدير Excel",
  IMPORT: "استيراد Excel",
  MUNICIPALITY_CREATE: "إضافة بلدية",
  MUNICIPALITY_UPDATE: "تعديل أو تفعيل بلدية",
  MUNICIPALITY_DISABLE: "تعطيل بلدية",
  USER_CREATE: "إضافة حساب",
  USER_DISABLE: "تعطيل حساب",
  USER_ENABLE: "تفعيل حساب",
  PASSWORD_RESET: "تعيين كلمة مرور",
};
const fieldLabels: Record<string, string> = {
  personName: "الاسم",
  spouseName: "اسم الزوجة",
  maritalStatus: "الحالة الاجتماعية",
  nationalId: "رقم البطاقة",
  familyBookNumber: "دفتر العائلة",
  familyMembersCount: "عدد أفراد الأسرة",
  phone: "الجوال",
  notes: "ملاحظات",
  name: "اسم البلدية",
  areaName: "المنطقة",
  isActive: "حالة التفعيل",
};
function Details({ entry }: { entry: AuditEntry }) {
  const meta = entry.metadata;
  return (
    <>
      {meta?.category && <p>{categoryLabels[meta.category]}</p>}
      {!!meta?.changedFields?.length && (
        <p>
          الحقول المعدلة:{" "}
          {meta.changedFields.map((f) => fieldLabels[f] ?? "حقل آخر").join("، ")}
        </p>
      )}
      {meta?.rowCount !== undefined && (
        <p>عدد السجلات: {numberText(meta.rowCount)}</p>
      )}
      {meta?.importedRows !== undefined && (
        <p>
          المستورد: {numberText(meta.importedRows)}، المكرر:{" "}
          {numberText(meta.duplicateRows ?? 0)}
        </p>
      )}
      {entry.entityId && (
        <details>
          <summary>معرّف العملية</summary>
          <bdi dir="ltr" className="identifier">
            {entry.entityId}
          </bdi>
        </details>
      )}
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const data = useAuditQuery({ page, action });
  const result = data.data;
  return (
    <>
      <PageHeader
        title="سجل التدقيق"
        subtitle="متابعة العمليات دون نسخ البيانات الشخصية أو كلمات المرور"
      />
      <div className="filters">
        <Field label="العملية">
          {(id) => (
            <select
              id={id}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">جميع العمليات</option>
              {Object.entries(actionLabels).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <section className="panel" aria-label="سجل التدقيق">
        {data.isLoading ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : !result?.items.length ? (
          <EmptyState>لا توجد عمليات مطابقة لهذا الاختيار.</EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">التاريخ</th>
                    <th scope="col">المستخدم</th>
                    <th scope="col">البلدية</th>
                    <th scope="col">العملية</th>
                    <th scope="col">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((a) => (
                    <tr key={a.id}>
                      <td className="cell-number" data-label="التاريخ">
                        {dateText(a.createdAt)}
                      </td>
                      <td data-label="المستخدم">
                        <bdi dir="ltr">{a.user?.username ?? "—"}</bdi>
                      </td>
                      <td data-label="البلدية">
                        {a.municipality?.name ?? "—"}
                      </td>
                      <td data-label="العملية">
                        {actionLabels[a.action] ?? "عملية إدارية"}
                      </td>
                      <td data-label="التفاصيل">
                        <Details entry={a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={result.total}
              pageSize={result.pageSize}
              onChange={setPage}
            />
          </>
        )}
      </section>
    </>
  );
}
