import { useState } from "react";
import type { FormEvent } from "react";
import {
  errorMessage,
  useConfirmImportMutation,
  useImportsQuery,
  useMunicipalityOptionsQuery,
  usePreviewImportMutation,
} from "../api";
import type { ImportRequest } from "../api";
import type { Category, ImportPreview } from "../types";
import { categories, categoryLabels, dateText, numberText } from "../types";
import {
  Confirmation,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  RowIssues,
} from "../components/ui";
const steps = [
  "اختر البلدية والفئة",
  "ارفع ملف xlsx",
  "راجع المعاينة",
  "أكّد الاستيراد",
];

export function Imports() {
  const [municipalityId, setMunicipalityId] = useState("");
  const [category, setCategory] = useState<Category>("MARTYR");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState(1);
  const options = useMunicipalityOptionsQuery();
  const history = useImportsQuery(page);
  const batches = history.data;
  const [previewImport, previewing] = usePreviewImportMutation();
  const [confirmImport, confirming] = useConfirmImportMutation();
  const busy = previewing.isLoading || confirming.isLoading;
  // Any change to the selection invalidates a preview that described the old
  // selection, so it is dropped rather than left on screen.
  const reset = () => {
    setPreview(null);
    setSuccess("");
    setError("");
  };
  const input = (): ImportRequest => ({ municipalityId, category, file });
  async function review(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    reset();
    try {
      setPreview(await previewImport(input()).unwrap());
    } catch (e) {
      setError(errorMessage(e, "تعذر قراءة الملف"));
    }
  }
  /**
   * The backend re-parses and re-validates the original file here. A failure
   * propagates to the confirmation dialog, which reports the reason and any
   * rows the backend rejected, and the preview stays on screen.
   *
   * Tag invalidation on the mutation refreshes the history, the record lists
   * and the summary counts.
   */
  async function importFile() {
    const result = await confirmImport(input()).unwrap();
    setPreview(null);
    setSuccess(
      "تم استيراد " +
        numberText(result.importedRows) +
        " سجلاً بنجاح، وتم تجاوز " +
        numberText(result.duplicateRows) +
        " سجلاً مكرراً.",
    );
  }
  const truncated =
    !!preview && (preview.invalidRows > 100 || preview.duplicateRows > 100);
  return (
    <>
      <PageHeader
        title="استيراد Excel"
        subtitle="المعاينة لا تكتب أي سجل؛ الاستيراد يحدث بعد التأكيد فقط"
      />
      <section className="panel">
        <div className="panel-head">
          <h2>معاينة ملف جديد</h2>
          <p>
            ملف .xlsx بورقة واحدة. الأخطاء تمنع الاستيراد، والمكررات تُتجاوز
            دون تعديل السجلات السابقة.
          </p>
        </div>
        <div className="panel-body">
          <ol className="import-steps" aria-label="مراحل الاستيراد">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {options.isLoading ? (
            <Loading />
          ) : options.isError ? (
            <ErrorState
              error={options.error}
              retry={() => void options.refetch()}
            />
          ) : (
            <form onSubmit={(e) => void review(e)}>
              <fieldset className="form-grid" disabled={busy || confirm}>
                <Field label="البلدية" required>
                  {(id) => (
                    <select
                      id={id}
                      required
                      value={municipalityId}
                      onChange={(e) => {
                        setMunicipalityId(e.target.value);
                        reset();
                      }}
                    >
                      <option value="">اختر البلدية</option>
                      {(options.data ?? [])
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
                <Field label="نوع الإحصاء">
                  {(id) => (
                    <select
                      id={id}
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value as Category);
                        reset();
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabels[c]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <div className="full-width">
                  <Field
                    label="ملف Excel"
                    hint="الحد الأقصى الافتراضي 10 ميغابايت و10000 سجل. استخدم ملف التصدير كنموذج للترويسات."
                    required
                  >
                    {(id, hintId) => (
                      <input
                        id={id}
                        type="file"
                        required
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        aria-describedby={hintId}
                        onChange={(e) => {
                          setFile(e.target.files?.[0] ?? null);
                          reset();
                        }}
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
              <button
                className="primary"
                disabled={busy || confirm || !file || !municipalityId}
              >
                {busy ? "جارٍ فحص الملف…" : "معاينة الملف"}
              </button>
            </form>
          )}
          {error && <Notice>{error}</Notice>}
          {success && <Notice kind="success">{success}</Notice>}
        </div>
      </section>
      {preview && (
        <section className="panel">
          <div className="panel-head">
            <h2>نتيجة المعاينة</h2>
            <p>لم يُكتب أي سجل في قاعدة البيانات حتى الآن.</p>
          </div>
          <div className="panel-body">
            <dl className="summary-grid">
              <div>
                <dt>إجمالي الصفوف</dt>
                <dd>{numberText(preview.totalRows)}</dd>
              </div>
              <div>
                <dt>صالح للاستيراد</dt>
                <dd>{numberText(preview.validRows)}</dd>
              </div>
              <div className={preview.invalidRows ? "is-problem" : undefined}>
                <dt>أخطاء</dt>
                <dd>{numberText(preview.invalidRows)}</dd>
              </div>
              <div>
                <dt>مكرر</dt>
                <dd>{numberText(preview.duplicateRows)}</dd>
              </div>
            </dl>
            <RowIssues
              title="صحح الأخطاء في الملف الأصلي ثم أعد المعاينة."
              issues={preview.errors}
            />
            <RowIssues
              title="تنبيهات لا تمنع الاستيراد"
              kind="warning"
              issues={preview.warnings}
            />
            {truncated && (
              <p className="muted">
                تُعرض أول 100 رسالة فقط؛ الأعداد أعلاه تشمل جميع الصفوف.
              </p>
            )}
            {!!preview.sample.length && (
              <>
                <h3>عينة من السجلات الصالحة</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">السطر</th>
                        <th scope="col">الاسم</th>
                        <th scope="col">عدد أفراد الأسرة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((r) => (
                        <tr key={r.row}>
                          <td className="cell-number" data-label="السطر">
                            {numberText(r.row)}
                          </td>
                          <td data-label="الاسم">{r.personName}</td>
                          <td className="cell-number" data-label="عدد أفراد الأسرة">
                            {r.familyMembersCount === null
                              ? "—"
                              : numberText(r.familyMembersCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="panel-actions">
              {!preview.canConfirm ? (
                <p role="status">الاستيراد غير متاح لوجود أخطاء في الملف. صحح الأخطاء المعروضة ثم أعد المعاينة.</p>
              ) : !preview.validRows ? (
                <p role="status">لا توجد سجلات جديدة للاستيراد؛ جميع الصفوف مكررة.</p>
              ) : busy ? (
                <p role="status">جارٍ فحص الملف أو استيراده، يرجى الانتظار.</p>
              ) : null}
              <button
                className="primary"
                disabled={!preview.canConfirm || busy || !preview.validRows}
                onClick={() => setConfirm(true)}
              >
                تأكيد استيراد {numberText(preview.validRows)} سجلاً
              </button>
            </div>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>سجل الاستيراد</h2>
        </div>
        {history.isLoading ? (
          <Loading />
        ) : history.isError ? (
          <ErrorState
            error={history.error}
            retry={() => void history.refetch()}
          />
        ) : !batches?.items.length ? (
          <EmptyState>لم يتم استيراد ملفات حتى الآن.</EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">التاريخ</th>
                    <th scope="col">البلدية</th>
                    <th scope="col">الفئة</th>
                    <th scope="col">الملف</th>
                    <th scope="col">المستورد</th>
                    <th scope="col">المكرر</th>
                    <th scope="col">المستخدم</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.items.map((b) => (
                    <tr key={b.id}>
                      <td className="cell-number" data-label="التاريخ">
                        {dateText(b.createdAt)}
                      </td>
                      <td data-label="البلدية">{b.municipality.name}</td>
                      <td data-label="الفئة">{categoryLabels[b.category]}</td>
                      <td data-label="الملف">{b.originalFileName}</td>
                      <td className="cell-number" data-label="المستورد">
                        {numberText(b.importedRows)}
                      </td>
                      <td className="cell-number" data-label="المكرر">
                        {numberText(b.duplicateRows)}
                      </td>
                      <td data-label="المستخدم">
                        <bdi dir="ltr">{b.createdBy.username}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={batches.total}
              pageSize={batches.pageSize}
              onChange={setPage}
            />
          </>
        )}
      </section>
      {confirm && (
        <Confirmation
          title="تأكيد استيراد الملف"
          message="سيتم فحص الملف الأصلي مجدداً واستيراد الصفوف الصالحة إلى البلدية المحددة. ستُتجاوز المكررات ولن تُعدّل سجلات موجودة."
          label="استيراد الآن"
          onClose={() => setConfirm(false)}
          onConfirm={importFile}
        />
      )}
    </>
  );
}