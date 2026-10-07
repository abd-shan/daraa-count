import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  errorMessage,
  useDeleteRecordMutation,
  useExportRecordsMutation,
  useMunicipalityOptionsQuery,
  useRecordsQuery,
  useRestoreRecordMutation,
} from "../api";
import type { RecordFilters } from "../api";
import type { Category, CensusRecord, MaritalStatus, User } from "../types";
import {
  categories,
  categoryLabels,
  maritalLabels,
  numberText,
} from "../types";
import {
  Confirmation,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Notice,
  PageHeader,
  Pagination,
} from "../components/ui";
import { useDebounced } from "../hooks";
import { RecordForm } from "../components/RecordForm";
import { RecordsTable } from "../components/RecordsTable";
export function Records({
  user,
  category: routeCategory,
}: {
  user: User;
  category?: Category;
}) {
  const admin = user.role === "SUPER_ADMIN";
  const [params, setParams] = useSearchParams();
  const category: Category =
    routeCategory ??
    (categories.includes(params.get("category") as Category)
      ? (params.get("category") as Category)
      : "MARTYR");
  const municipalityId = admin ? (params.get("municipalityId") ?? "") : "";
  const deleted = admin && params.get("deleted") === "true";
  const requestedStatus = params.get("maritalStatus");
  const maritalStatus =
    category !== "EXTREME_POVERTY" &&
    requestedStatus &&
    Object.hasOwn(maritalLabels, requestedStatus)
      ? (requestedStatus as MaritalStatus)
      : undefined;
  const requestedPage = Number(params.get("page"));
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 100000
      ? requestedPage
      : 1;
  const urlSearch = params.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search);
  const [editor, setEditor] = useState<CensusRecord | "new" | null>(null);
  const [action, setAction] = useState<{
    record: CensusRecord;
    restore: boolean;
  } | null>(null);
  // The feedback carries the filters it belongs to, so a filter or page change
  // retires it without an extra render pass.
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
    key: string;
  } | null>(null);
  const change = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.set("page", "1");
      return next;
    });
  // The typed value stays local for responsiveness, then lands in the URL so a
  // reloaded or shared link keeps the same search.
  useEffect(() => {
    if (debounced === urlSearch) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set("search", debounced);
        else next.delete("search");
        next.set("page", "1");
        return next;
      },
      { replace: true },
    );
  }, [debounced, urlSearch, setParams]);
  const options = useMunicipalityOptionsQuery(undefined, { skip: !admin });
  // `municipalityId` is empty for a municipality user, so no municipality
  // filter is ever sent from a municipality interface.
  const filters: RecordFilters = {
    category,
    page,
    search: urlSearch,
    deleted,
    maritalStatus,
    municipalityId: municipalityId || undefined,
  };
  const key = JSON.stringify(filters);
  const data = useRecordsQuery(filters);
  const [exportRecords, exporting] = useExportRecordsMutation();
  const [deleteRecord] = useDeleteRecordMutation();
  const [restoreRecord] = useRestoreRecordMutation();
  const notice = feedback?.key === key ? feedback : null;
  const succeed = (text: string) => setFeedback({ kind: "success", text, key });
  async function runExport() {
    setFeedback(null);
    try {
      await exportRecords(filters).unwrap();
      succeed("تم تجهيز ملف Excel وتنزيله");
    } catch (e) {
      setFeedback({
        kind: "error",
        text: errorMessage(e, "تعذر التصدير"),
        key,
      });
    }
  }
  const addRecord = () => {
    setFeedback(null);
    setEditor("new");
  };
  const total = data.data?.total ?? 0;
  return (
    <>
      <PageHeader
        title={categoryLabels[category]}
        subtitle={
          deleted
            ? "السجلات المحذوفة — يمكن استعادتها"
            : admin
              ? "سجلات جميع البلديات"
              : user.municipality?.name
        }
      >
        {!deleted && (
          <>
            <button
              className="primary"
              disabled={admin && !options.data}
              onClick={addRecord}
            >
              إضافة سجل جديد
            </button>
            <button
              className="secondary"
              disabled={exporting.isLoading || !total}
              onClick={() => void runExport()}
            >
              {exporting.isLoading ? "جارٍ التصدير…" : "تصدير Excel"}
            </button>
          </>
        )}
      </PageHeader>
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <div className="filters">
        {admin && (
          <>
            <Field label="نوع الإحصاء">
              {(id) => (
                <select
                  id={id}
                  value={category}
                  onChange={(e) => change("category", e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="البلدية">
              {(id) => (
                <select
                  id={id}
                  value={municipalityId}
                  onChange={(e) => change("municipalityId", e.target.value)}
                >
                  <option value="">جميع البلديات</option>
                  {options.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.isActive ? "" : " (معطلة)"}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}
        {category !== "EXTREME_POVERTY" && (
          <Field label="الحالة الاجتماعية">
            {(id) => (
              <select
                id={id}
                value={maritalStatus ?? ""}
                onChange={(e) => change("maritalStatus", e.target.value)}
              >
                <option value="">جميع الحالات</option>
                {Object.entries(maritalLabels).map(([status, label]) => (
                  <option key={status} value={status}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="بحث" hint="الاسم، رقم البطاقة، دفتر العائلة أو الجوال">
          {(id, hintId) => (
            <input
              id={id}
              type="search"
              value={search}
              maxLength={100}
              placeholder="اكتب للبحث…"
              aria-describedby={hintId}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </Field>
        {admin && (
          <Field label="حالة السجلات">
            {(id) => (
              <select
                id={id}
                value={String(deleted)}
                onChange={(e) => change("deleted", e.target.value)}
              >
                <option value="false">السجلات النشطة</option>
                <option value="true">السجلات المحذوفة</option>
              </select>
            )}
          </Field>
        )}
      </div>
      {admin && options.isError && (
        <ErrorState
          error={options.error}
          retry={() => void options.refetch()}
        />
      )}
      <section className="panel" aria-label="السجلات">
        {data.isLoading ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : !data.data?.items.length ? (
          <EmptyState
            title={
              urlSearch || maritalStatus
                ? "لا توجد نتائج مطابقة"
                : "لا توجد سجلات بعد"
            }
            action={
              !deleted &&
              !urlSearch &&
              !maritalStatus && (
                <button
                  className="primary"
                  disabled={admin && !options.data}
                  onClick={addRecord}
                >
                  إضافة أول سجل
                </button>
              )
            }
          >
            {maritalStatus
              ? "جرّب حالة اجتماعية أخرى أو اختر جميع الحالات لعرض السجلات."
              : urlSearch
                ? "جرّب كلمة أقصر أو امسح البحث لعرض كل السجلات."
                : deleted
                  ? "لا توجد سجلات محذوفة ضمن هذا الاختيار."
                  : "ابدأ بإضافة سجل، أو استخدم البحث بعد الإدخال."}
          </EmptyState>
        ) : (
          <>
            <div className="table-caption">
              <span>
                {numberText(total)} سجل — {categoryLabels[category]}
              </span>
              {data.isFetching && (
                <span className="loading">جارٍ التحديث…</span>
              )}
            </div>
            <RecordsTable
              records={data.data.items}
              admin={admin}
              deleted={deleted}
              onEdit={(r) => {
                setFeedback(null);
                setEditor(r);
              }}
              onDelete={(r) => setAction({ record: r, restore: false })}
              onRestore={(r) => setAction({ record: r, restore: true })}
            />
            <Pagination
              page={data.data.page}
              total={total}
              pageSize={data.data.pageSize}
              onChange={(p) => change("page", String(p))}
            />
          </>
        )}
      </section>
      {editor && (
        <RecordForm
          category={category}
          record={editor === "new" ? undefined : editor}
          municipalities={admin ? options.data : undefined}
          municipalityId={municipalityId}
          userId={user.id}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            succeed("تم حفظ البيانات بنجاح");
          }}
        />
      )}
      {action && (
        <Confirmation
          title={action.restore ? "استعادة السجل" : "حذف السجل"}
          danger={!action.restore}
          message={
            action.restore
              ? "هل تريد استعادة هذا السجل إلى القائمة النشطة؟"
              : "هل تريد حذف سجل «" +
                action.record.personName +
                "»؟ سيُستبعد من القوائم والتصدير، ويمكن لمسؤول النظام استعادته."
          }
          label={action.restore ? "استعادة السجل" : "تأكيد الحذف"}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            const id = action.record.id;
            // Tag invalidation refreshes the list and the counts.
            await (action.restore
              ? restoreRecord(id).unwrap()
              : deleteRecord(id).unwrap());
            succeed(action.restore ? "تمت استعادة السجل" : "تم حذف السجل");
          }}
        />
      )}
    </>
  );
}
