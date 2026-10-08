import { useState } from "react";
import type { FormEvent } from "react";
import {
  errorFields,
  errorMessage,
  useAreasQuery,
  useCreateMunicipalityMutation,
  useUpdateMunicipalityMutation,
} from "../api";
import type { Municipality } from "../types";
import { Confirmation, Dialog, Field, Notice } from "./ui";
import { useDirtyWarning } from "../hooks";

export type MunicipalityEditMode =
  { kind: "create" } | { kind: "edit"; municipality: Municipality };

function AreaInput({
  id,
  value,
  onChange,
  options,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  invalid: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const suggestions = options
    .filter((name) => name.includes(query.trim()))
    .slice(0, 8);
  const expanded = open && suggestions.length > 0;
  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="area-input">
      <input
        id={id}
        role="combobox"
        required
        maxLength={150}
        value={value}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? id + "-options" : undefined}
        aria-activedescendant={
          expanded && active >= 0 ? id + "-option-" + active : undefined
        }
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(-1);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (
            (e.key === "ArrowDown" || e.key === "ArrowUp") &&
            suggestions.length
          ) {
            e.preventDefault();
            setOpen(true);
            setActive((index) =>
              e.key === "ArrowDown"
                ? (index + 1) % suggestions.length
                : index <= 0
                  ? suggestions.length - 1
                  : index - 1,
            );
          } else if (e.key === "Enter" && expanded && active >= 0) {
            e.preventDefault();
            choose(suggestions[active]);
          }
        }}
      />
      {expanded && (
        <ul
          id={id + "-options"}
          className="area-suggestions"
          role="listbox"
          aria-label="المناطق المحفوظة"
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={id + "-option-" + index}
              role="option"
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MunicipalityEditor({
  mode,
  lastAreaName,
  onClose,
  onSaved,
}: {
  mode: MunicipalityEditMode;
  lastAreaName: string;
  onClose: () => void;
  onSaved: (areaName: string) => void;
}) {
  const municipality = mode.kind === "edit" ? mode.municipality : undefined;
  const initialArea = municipality?.areaName ?? lastAreaName;
  const [name, setName] = useState(municipality?.name ?? "");
  const [areaName, setAreaName] = useState(initialArea);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const [createMunicipality] = useCreateMunicipalityMutation();
  const [updateMunicipality] = useUpdateMunicipalityMutation();
  const areas = useAreasQuery();
  const dirty = name !== (municipality?.name ?? "") || areaName !== initialArea;
  useDirtyWarning(dirty);
  const close = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFields({});
    try {
      const result =
        mode.kind === "create"
          ? await createMunicipality({ name, areaName }).unwrap()
          : await updateMunicipality({
              id: mode.municipality.id,
              body: { name, areaName },
            }).unwrap();
      onSaved(result.areaName);
    } catch (error) {
      setMessage(errorMessage(error, "تعذر الحفظ"));
      setFields(errorFields(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Dialog
        title={mode.kind === "create" ? "إضافة بلدية" : "تعديل البلدية"}
        onClose={close}
        busy={busy}
      >
        {message && <Notice>{message}</Notice>}
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={busy} className="form-grid">
            <Field label="اسم البلدية" error={fields.name} required>
              {(id, errorId) => (
                <input
                  id={id}
                  required
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!fields.name}
                  aria-describedby={errorId}
                />
              )}
            </Field>
            <Field
              label="المنطقة"
              error={fields.areaName}
              hint="اختر منطقة محفوظة أو اكتب اسم منطقة جديدة"
              required
            >
              {(id, errorId) => (
                <AreaInput
                  id={id}
                  value={areaName}
                  onChange={setAreaName}
                  options={areas.data ?? []}
                  invalid={!!fields.areaName}
                  describedBy={errorId}
                />
              )}
            </Field>
          </fieldset>
          {areas.isError && (
            <p className="muted">
              تعذر تحميل المناطق المحفوظة. يمكنك كتابة المنطقة أو{" "}
              <button
                type="button"
                className="secondary button-small"
                onClick={() => void areas.refetch()}
              >
                إعادة المحاولة
              </button>
            </p>
          )}
          <div className="dialog-actions">
            <button className="primary" disabled={busy}>
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </button>
            <button
              className="secondary dialog-cancel"
              type="button"
              disabled={busy}
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
          message="هل تريد إغلاق النموذج دون حفظ؟"
          label="إغلاق دون حفظ"
          danger
          onClose={() => setDiscard(false)}
          onConfirm={async () => onClose()}
        />
      )}
    </>
  );
}
