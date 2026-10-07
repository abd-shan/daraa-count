import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  errorFields,
  errorMessage,
  useCreateRecordMutation,
  useUpdateRecordMutation,
} from "../api";
import { clearDraft, readDraft, saveDraft } from "../drafts";
import type { RecordPayload } from "../api";
import type {
  Category,
  CensusRecord,
  MaritalStatus,
  MunicipalityOption,
} from "../types";
import { categoryLabels, normalizeDigits, personLabels } from "../types";
import { Confirmation, Dialog, Field, Notice } from "./ui";
import { useDirtyWarning } from "../hooks";
interface FormValues {
  personName: string;
  maritalStatus: string;
  spouseName: string;
  nationalId: string;
  familyBookNumber: string;
  familyMembersCount: string;
  phone: string;
  notes: string;
  municipalityId: string;
}
const maxCount = 10000;
export function RecordForm({
  category,
  record,
  municipalities,
  municipalityId,
  userId,
  onClose,
  onSaved,
}: {
  category: Category;
  record?: CensusRecord;
  municipalities?: MunicipalityOption[];
  municipalityId?: string;
  /** Scopes the unsent draft. Omitted means drafts are off for this form. */
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: FormValues = {
    personName: record?.personName ?? "",
    maritalStatus: record?.maritalStatus ?? "",
    spouseName: record?.spouseName ?? "",
    nationalId: record?.nationalId ?? "",
    familyBookNumber: record?.familyBookNumber ?? "",
    familyMembersCount:
      record?.familyMembersCount != null ? String(record.familyMembersCount) : "",
    phone: record?.phone ?? "",
    notes: record?.notes ?? "",
    municipalityId: record?.municipalityId ?? municipalityId ?? "",
  };
  /**
   * Unsent drafts are kept for NEW records only.
   *
   * An edit is deliberately excluded: its `expectedUpdatedAt` guard would go
   * stale while the draft sat in storage, so restoring one could push an old
   * version over a newer save by somebody else. A new record has nothing to
   * overwrite, which is also the case the committees actually lose work in.
   */
  const draftUser = record ? null : (userId ?? null);
  const draftKey = "record:new:" + category;
  const [savedDraft] = useState(() =>
    draftUser ? readDraft<FormValues>(draftUser, draftKey) : null,
  );
  const [values, setValues] = useState(savedDraft ?? initial);
  const [draftRestored, setDraftRestored] = useState(!!savedDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [createRecord] = useCreateRecordMutation();
  const [updateRecord] = useUpdateRecordMutation();
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useDirtyWarning(dirty);
  // Keep the draft current, a short moment after typing stops.
  useEffect(() => {
    if (!draftUser || !dirty) return;
    const timeout = setTimeout(
      () => saveDraft(draftUser, draftKey, values),
      400,
    );
    return () => clearTimeout(timeout);
  }, [draftUser, draftKey, dirty, values]);
  const dropDraft = () => {
    if (draftUser) clearDraft(draftUser, draftKey);
  };
  const discardDraft = () => {
    dropDraft();
    setValues(initial);
    setDraftRestored(false);
    setErrors({});
    setMessage("");
  };
  // Marital status and a spouse name only apply to the martyr and injured
  // categories; extreme poverty records keep an optional spouse name.
  const marriedCategory = category !== "EXTREME_POVERTY";
  const set = (key: keyof FormValues, value: string) =>
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(key === "maritalStatus" && value === "SINGLE"
        ? { spouseName: "" }
        : {}),
    }));
  const close = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!values.personName.trim()) next.personName = "الاسم مطلوب";
    if (marriedCategory && !values.maritalStatus)
      next.maritalStatus = "الحالة الاجتماعية مطلوبة";
    if (
      marriedCategory &&
      values.maritalStatus === "MARRIED" &&
      !values.spouseName.trim()
    )
      next.spouseName = "اسم الزوجة مطلوب للمتزوج";
    const count = Number(normalizeDigits(values.familyMembersCount));
    if (
      values.familyMembersCount.trim() &&
      (!Number.isInteger(count) || count < 1 || count > maxCount)
    )
      next.familyMembersCount =
        "عدد أفراد الأسرة يجب أن يكون رقماً صحيحاً أكبر من صفر وحتى " +
        maxCount;
    if (municipalities && !values.municipalityId)
      next.municipalityId = "اختر البلدية";
    return next;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    const payload: RecordPayload = {
      category,
      personName: values.personName,
      maritalStatus: marriedCategory
        ? (values.maritalStatus as MaritalStatus)
        : null,
      spouseName:
        marriedCategory && values.maritalStatus === "SINGLE"
          ? null
          : values.spouseName,
      familyMembersCount: values.familyMembersCount.trim()
        ? Number(normalizeDigits(values.familyMembersCount))
        : null,
      // Identifiers stay strings so leading zeroes survive.
      nationalId: normalizeDigits(values.nationalId),
      familyBookNumber: normalizeDigits(values.familyBookNumber),
      phone: normalizeDigits(values.phone),
      notes: values.notes,
      ...(municipalities ? { municipalityId: values.municipalityId } : {}),
    };
    try {
      if (record)
        await updateRecord({
          id: record.id,
          expectedUpdatedAt: record.updatedAt,
          body: payload,
        }).unwrap();
      else await createRecord(payload).unwrap();
      // Saved on the server: the draft has done its job.
      dropDraft();
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error, "تعذر حفظ البيانات"));
      setErrors(errorFields(error));
    } finally {
      setSaving(false);
    }
  }
  const textField = (
    key: keyof FormValues,
    label: string,
    max: number,
    ltr = false,
    required = false,
  ) => (
    <Field key={key} label={label} error={errors[key]} required={required}>
      {(id, errorId) => (
        <input
          id={id}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
          maxLength={max}
          dir={ltr ? "ltr" : undefined}
          inputMode={ltr ? "numeric" : undefined}
          required={required}
          aria-invalid={!!errors[key]}
          aria-describedby={errorId}
        />
      )}
    </Field>
  );
  return (
    <>
      <Dialog
        title={record ? "تعديل السجل" : "إضافة سجل جديد"}
        onClose={close}
        busy={saving}
      >
        <p className="muted">الفئة: {categoryLabels[category]}</p>
        {draftRestored && (
          <Notice kind="info">
            <div className="notice-row">
              <span>
                تمت استعادة بيانات لم تُحفظ من آخر محاولة. تابع الإدخال أو ابدأ
                من جديد.
              </span>
              <button
                type="button"
                className="secondary button-small"
                onClick={discardDraft}
              >
                بدء نموذج فارغ
              </button>
            </div>
          </Notice>
        )}
        <form onSubmit={(e) => void save(e)} noValidate>
          {message && <Notice>{message}</Notice>}
          <fieldset disabled={saving} className="form-grid">
            {municipalities && (
              <Field label="البلدية" error={errors.municipalityId} required>
                {(id, errorId) => (
                  <select
                    id={id}
                    value={values.municipalityId}
                    disabled={!!record}
                    onChange={(e) => set("municipalityId", e.target.value)}
                    aria-invalid={!!errors.municipalityId}
                    aria-describedby={errorId}
                  >
                    <option value="">اختر البلدية</option>
                    {municipalities
                      .filter(
                        (m) => m.isActive || m.id === record?.municipalityId,
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
            )}
            {textField("personName", personLabels[category], 200, false, true)}
            {marriedCategory && (
              <Field label="الحالة الاجتماعية" error={errors.maritalStatus} required>
                {(id, errorId) => (
                  <select
                    id={id}
                    value={values.maritalStatus}
                    onChange={(e) => set("maritalStatus", e.target.value)}
                    required
                    aria-invalid={!!errors.maritalStatus}
                    aria-describedby={errorId}
                  >
                    <option value="">اختر الحالة الاجتماعية</option>
                    <option value="SINGLE">عازب/عازبة</option>
                    <option value="MARRIED">متزوج/متزوجة</option>
                    <option value="WIDOWED">أرمل/أرملة</option>
                    <option value="DIVORCED">مطلق/مطلقة</option>
                  </select>
                )}
              </Field>
            )}
            {(!marriedCategory || (values.maritalStatus && values.maritalStatus !== "SINGLE")) &&
              textField(
                "spouseName",
                "الاسم الثلاثي للزوجة",
                200,
                false,
                marriedCategory && values.maritalStatus === "MARRIED",
              )}
            {textField("nationalId", "رقم البطاقة الشخصية", 50, true)}
            {textField("familyBookNumber", "رقم دفتر العائلة", 50, true)}
            {textField("familyMembersCount", "عدد أفراد الأسرة", 5, true)}
            {textField("phone", "رقم الجوال", 50, true)}
            <div className="full-width">
              <Field label="ملاحظات" error={errors.notes}>
                {(id, errorId) => (
                  <textarea
                    id={id}
                    value={values.notes}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => set("notes", e.target.value)}
                    aria-invalid={!!errors.notes}
                    aria-describedby={errorId}
                  />
                )}
              </Field>
            </div>
          </fieldset>
          <div className="dialog-actions">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ…" : "حفظ السجل"}
            </button>
            <button
              className="secondary dialog-cancel"
              type="button"
              disabled={saving}
              onClick={close}
            >
              إلغاء
            </button>
          </div>
        </form>
      </Dialog>
      {discard && (
        <Confirmation
          title="تجاهل التعديلات؟"
          message="يوجد تعديل لم يتم حفظه. هل تريد إغلاق النموذج دون حفظ؟"
          label="إغلاق دون حفظ"
          danger
          onClose={() => setDiscard(false)}
          onConfirm={async () => {
            dropDraft();
            onClose();
          }}
        />
      )}
    </>
  );
}
