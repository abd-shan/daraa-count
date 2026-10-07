import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { errorMessage, errorRows } from "../api";
import type { RowIssue } from "../types";
import { numberText } from "../types";
import { EyeIcon, EyeOffIcon } from "./icons";
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function Field({
  label,
  error,
  children,
  hint,
  required = false,
}: {
  label: string;
  error?: string;
  children: (id: string, errorId: string | undefined) => ReactNode;
  hint?: string;
  /**
   * Draws the required marker. The marker is CSS generated content, so it
   * never enters the label's accessible name; the `required` attribute on the
   * control itself is what assistive technology announces.
   */
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={required ? "field is-required" : "field"}>
      <label htmlFor={id}>{label}</label>
      {children(id, error ? id + "-error" : hint ? id + "-hint" : undefined)}
      {hint && <small id={id + "-hint"}>{hint}</small>}
      {error && (
        <small className="field-error" id={id + "-error"}>
          {error}
        </small>
      )}
    </div>
  );
}
/**
 * A password input with a show/hide toggle, so a long password typed on a
 * phone can be checked before submitting.
 *
 * The toggle is a real button: it is reachable by keyboard, states what it
 * does in Arabic, and reports its state through `aria-pressed`. Revealing is
 * always a deliberate action and resets to hidden whenever the field remounts.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  describedBy,
  autoComplete,
  minLength,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password-field">
      <input
        id={id}

        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={128}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        title={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
export function Notice({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "success" | "info" | "warning";
}) {
  return (
    <div
      className={"notice " + kind}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
/** Row-level issues reported by the Excel import endpoints. */
export function RowIssues({
  title,
  issues,
  kind = "error",
}: {
  title: string;
  issues: RowIssue[];
  kind?: "error" | "warning";
}) {
  if (!issues.length) return null;
  return (
    <Notice kind={kind}>
      <strong>{title}</strong>
      <ul className="notice-scroll">
        {issues.map((issue, index) => (
          <li key={index}>
            السطر {numberText(issue.row)}: {issue.message}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
export function Loading() {
  return (
    <p className="state">
      <span className="loading" role="status">
        جارٍ تحميل البيانات…
      </span>
    </p>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  /** Anything an endpoint can reject with; normalized by errorMessage. */
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="state">
      <Notice>{errorMessage(error, "تعذر تحميل البيانات")}</Notice>
      {retry && (
        <button className="secondary" onClick={retry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {title && <p className="empty-title">{title}</p>}
      <p>{children}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="pagination" aria-label="صفحات النتائج">
      <span>
        صفحة {numberText(page)} من {numberText(pages)} — {numberText(total)}{" "}
        سجل
      </span>
      <div className="actions">
        <button
          className="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          الصفحة السابقة
        </button>
        <button
          className="secondary"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          الصفحة التالية
        </button>
      </div>
    </nav>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    // showModal() lands on the close button. Start on the first editable
    // control, or on the cancel button so Enter never confirms by reflex.
    const target =
      dialog?.querySelector<HTMLElement>(
        "input:not([type=hidden]), select, textarea",
      ) ?? dialog?.querySelector<HTMLElement>(".dialog-cancel");
    target?.focus();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="close secondary"
          type="button"
          aria-label="إغلاق"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirmation({
  title,
  message,
  label = "تأكيد",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  label?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RowIssue[]>([]);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    setRows([]);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "تعذر إتمام العملية"));
      // A rejected import confirmation reports the rows that blocked it.
      setRows(errorRows(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <p>{message}</p>
      {error && <Notice>{error}</Notice>}
      <RowIssues title="تفاصيل الصفوف" issues={rows} />
      <div className="dialog-actions">
        <button
          className={danger ? "danger" : "primary"}
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "جارٍ التنفيذ…" : label}
        </button>
        <button
          className="secondary dialog-cancel"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          إلغاء
        </button>
      </div>
    </Dialog>
  );
}
export function CategoryCard({
  title,
  count,
  to,
}: {
  title: string;
  count: number;
  to: string;
}) {
  return (
    <Link to={to} className="category-card">
      <h2>{title}</h2>
      <p className="category-card-count">
        <strong>{numberText(count)}</strong>
        <span>{count === 1 ? "سجل" : "سجل مُدخل"}</span>
      </p>
      <span className="card-action">
        فتح السجلات والإضافة <span aria-hidden="true">←</span>
      </span>
    </Link>
  );
}
