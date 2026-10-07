import type { RowIssue } from "../types";

/**
 * The normalized failure shape every endpoint rejects with.
 *
 * This is a plain object rather than an Error subclass on purpose: RTK Query
 * stores the rejected value in the Redux store, and the store must stay
 * serializable. Components read it through the helpers below instead of
 * instanceof checks.
 */
export interface ApiFailure {
  /** HTTP status, or 0 for a network/transport failure. */
  status: number;
  /** Backend error code such as `DUPLICATE` or `STALE_RECORD`. */
  code: string;
  /** Arabic message, already fit to display. */
  message: string;
  /** Per-field validation messages, keyed by field name. */
  fields: Record<string, string>;
  /** Row-level issues from the Excel import endpoints; empty when none. */
  rows: RowIssue[];
}

export const OFFLINE_MESSAGE =
  "تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة";

function defaultMessage(status: number) {
  if (status === 401) return "انتهت جلسة الدخول. يرجى تسجيل الدخول مجدداً";
  if (status === 403) return "ليس لديك صلاحية لتنفيذ هذه العملية";
  if (status === 0) return OFFLINE_MESSAGE;
  return "تعذر إتمام العملية. يرجى المحاولة مجدداً";
}

/** The backend error envelope; every field is optional. */
interface ErrorBody {
  message?: unknown;
  code?: unknown;
  fields?: unknown;
  errors?: unknown;
}

/** Builds an ApiFailure from a status and whatever the backend sent back. */
export function toApiFailure(status: number, body: unknown): ApiFailure {
  const data = (typeof body === "object" && body !== null ? body : {}) as ErrorBody;
  return {
    status,
    code: typeof data.code === "string" ? data.code : "HTTP_" + status,
    message:
      typeof data.message === "string" && data.message
        ? data.message
        : defaultMessage(status),
    fields:
      typeof data.fields === "object" && data.fields !== null
        ? (data.fields as Record<string, string>)
        : {},
    rows: Array.isArray(data.errors) ? (data.errors as RowIssue[]) : [],
  };
}

function asFailure(error: unknown): ApiFailure | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as Partial<ApiFailure>;
  return typeof candidate.status === "number" &&
    typeof candidate.message === "string"
    ? (candidate as ApiFailure)
    : null;
}

/** Arabic message for anything a component can be handed as an error. */
export function errorMessage(error: unknown, fallback = ""): string {
  const failure = asFailure(error);
  if (failure) return failure.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback || defaultMessage(500);
}

/** Per-field messages to attach to form inputs. */
export function errorFields(error: unknown): Record<string, string> {
  return asFailure(error)?.fields ?? {};
}

/** Row-level import issues to list for the user. */
export function errorRows(error: unknown): RowIssue[] {
  return asFailure(error)?.rows ?? [];
}
