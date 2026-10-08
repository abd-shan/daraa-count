import { useState } from "react";
import { useMunicipalitiesQuery, useUpdateMunicipalityMutation } from "../api";
import { numberText } from "../types";
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
import { MunicipalityEditor } from "../components/MunicipalityEditor";
import type { MunicipalityEditMode } from "../components/MunicipalityEditor";
export function Municipalities() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // The notice carries the list it belongs to, so a search or page change
  // retires it instead of leaving a stale success message on screen.
  const [notice, setNotice] = useState<{ text: string; key: string } | null>(
    null,
  );
  const [editor, setEditor] = useState<MunicipalityEditMode | null>(null);
  const [action, setAction] = useState<{
    id: string;
    active: boolean;
    name: string;
  } | null>(null);
  const debounced = useDebounced(search);
  const data = useMunicipalitiesQuery({ page, search: debounced });
  const [lastAreaName, setLastAreaName] = useState("");
  const [updateMunicipality] = useUpdateMunicipalityMutation();
  const key = page + "|" + debounced;
  const shown = notice?.key === key ? notice.text : "";
  return (
    <>
      <PageHeader
        title="البلديات"
        subtitle="إضافة البلديات وتنظيمها حسب المنطقة"
      >
        <button
          className="primary"
          onClick={() => setEditor({ kind: "create" })}
        >
          إضافة بلدية
        </button>
      </PageHeader>
      {shown && <Notice kind="success">{shown}</Notice>}
      <div className="filters">
        <Field label="بحث عن بلدية" hint="اسم البلدية أو المنطقة">
          {(id, hintId) => (
            <input
              id={id}
              type="search"
              value={search}
              maxLength={100}
              placeholder="اكتب للبحث…"
              aria-describedby={hintId}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>
      </div>
      <section className="panel" aria-label="البلديات">
        {data.isLoading ? (
          <Loading />
        ) : data.isError ? (
          <ErrorState error={data.error} retry={() => void data.refetch()} />
        ) : !data.data?.items.length ? (
          <EmptyState
            title={debounced ? "لا توجد بلديات مطابقة" : "لا توجد بلديات بعد"}
            action={
              <button
                className="primary"
                onClick={() => setEditor({ kind: "create" })}
              >
                إضافة بلدية
              </button>
            }
          >
            أضف البلدية بكتابة اسمها والمنطقة فقط.
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">الاسم</th>
                    <th scope="col">المنطقة</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">السجلات</th>
                    <th scope="col">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.items.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{m.name}</th>
                      <td data-label="المنطقة">{m.areaName}</td>
                      <td data-label="الحالة">
                        <span
                          className={
                            "badge " + (m.isActive ? "active" : "inactive")
                          }
                        >
                          {m.isActive ? "مفعّلة" : "معطّلة"}
                        </span>
                      </td>
                      <td className="cell-number" data-label="السجلات">
                        {numberText(m._count.records)}
                      </td>
                      <td className="cell-actions">
                        <div className="stack-actions">
                          <button
                            className="secondary button-small"
                            onClick={() =>
                              setEditor({ kind: "edit", municipality: m })
                            }
                          >
                            تعديل البلدية
                          </button>

                          <button
                            className={
                              (m.isActive ? "danger" : "secondary") +
                              " button-small"
                            }
                            onClick={() =>
                              setAction({
                                id: m.id,
                                active: !m.isActive,
                                name: "بلدية " + m.name,
                              })
                            }
                          >
                            {m.isActive ? "تعطيل البلدية" : "تفعيل البلدية"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.data.total}
              pageSize={data.data.pageSize}
              onChange={setPage}
            />
          </>
        )}
      </section>
      {editor && (
        <MunicipalityEditor
          mode={editor}
          lastAreaName={lastAreaName}
          onClose={() => setEditor(null)}
          onSaved={(areaName) => {
            setLastAreaName(areaName);
            setEditor(null);
            // Tag invalidation on each mutation refreshes the list, the
            // selector options and the summary counts.
            setNotice({ text: "تم حفظ البيانات بنجاح", key });
          }}
        />
      )}
      {action && (
        <Confirmation
          title={(action.active ? "تفعيل " : "تعطيل ") + action.name}
          danger={!action.active}
          label={action.active ? "تفعيل" : "تعطيل"}
          message={
            "هل تريد " +
            (action.active ? "تفعيل " : "تعطيل ") +
            action.name +
            "؟" +
            (action.active
              ? ""
              : " سيتم إنهاء جلسات الدخول المرتبطة به مع الاحتفاظ بالسجلات.")
          }
          onClose={() => setAction(null)}
          onConfirm={async () => {
            const body = { isActive: action.active };
            const args = { id: action.id, body };
            await updateMunicipality(args).unwrap();
            setNotice({
              text: action.active ? "تم التفعيل" : "تم التعطيل",
              key,
            });
          }}
        />
      )}
    </>
  );
}
