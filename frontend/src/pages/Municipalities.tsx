import { useState } from "react";
import type { FormEvent } from "react";
import {
  errorFields,
  errorMessage,
  useCreateAccountMutation,
  useCreateMunicipalityMutation,
  useMunicipalitiesQuery,
  useUpdateAccountMutation,
  useUpdateMunicipalityMutation,
} from "../api";
import type { Municipality, MunicipalityAccount } from "../types";
import { dateText, numberText } from "../types";
import {
  Confirmation,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  PasswordInput,
} from "../components/ui";
import { useDebounced, useDirtyWarning } from "../hooks";
type EditMode =
  | { kind: "create" }
  | { kind: "edit"; municipality: Municipality }
  | { kind: "account"; municipality: Municipality }
  | { kind: "password"; user: MunicipalityAccount; municipality: Municipality };
const titles: Record<EditMode["kind"], string> = {
  create: "إضافة بلدية وحسابها",
  edit: "تعديل البلدية",
  account: "إضافة حساب للبلدية",
  password: "تعيين كلمة مرور جديدة",
};
function MunicipalityEditor({
  mode,
  onClose,
  onSaved,
}: {
  mode: EditMode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const municipality = mode.kind === "create" ? undefined : mode.municipality;
  const [name, setName] = useState(municipality?.name ?? "");
  const [areaName, setAreaName] = useState(municipality?.areaName ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [createMunicipality] = useCreateMunicipalityMutation();
  const [updateMunicipality] = useUpdateMunicipalityMutation();
  const [createAccount] = useCreateAccountMutation();
  const [updateAccount] = useUpdateAccountMutation();
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const dirty =
    name !== (municipality?.name ?? "") ||
    areaName !== (municipality?.areaName ?? "") ||
    !!username ||
    !!password;
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
      if (mode.kind === "create")
        await createMunicipality({
          name,
          areaName,
          username,
          password,
        }).unwrap();
      else if (mode.kind === "edit")
        await updateMunicipality({
          id: mode.municipality.id,
          body: { name, areaName },
        }).unwrap();
      else if (mode.kind === "account")
        await createAccount({
          municipalityId: mode.municipality.id,
          body: { username, password },
        }).unwrap();
      else
        await updateAccount({
          id: mode.user.id,
          body: { password },
        }).unwrap();
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error, "تعذر الحفظ"));
      setFields(errorFields(error));
    } finally {
      setBusy(false);
    }
  }
  const needsMunicipality = mode.kind === "create" || mode.kind === "edit";
  const needsUsername = mode.kind === "create" || mode.kind === "account";
  return (
    <>
      <Dialog title={titles[mode.kind]} onClose={close} busy={busy}>
        {mode.kind === "password" && (
          <p>
            تعيين كلمة مرور جديدة للحساب <bdi dir="ltr">{mode.user.username}</bdi>
            . سيتم إنهاء جلسات دخوله الحالية.
          </p>
        )}
        {mode.kind === "account" && (
          <p className="muted">البلدية: {mode.municipality.name}</p>
        )}
        {message && <Notice>{message}</Notice>}
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={busy} className="form-grid">
            {needsMunicipality && (
              <>
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
                <Field label="المنطقة" error={fields.areaName} required>
                  {(id, errorId) => (
                    <input
                      id={id}
                      required
                      maxLength={150}
                      value={areaName}
                      onChange={(e) => setAreaName(e.target.value)}
                      aria-invalid={!!fields.areaName}
                      aria-describedby={errorId}
                    />
                  )}
                </Field>
              </>
            )}
            {needsUsername && (
              <Field
                label="اسم المستخدم"
                error={fields.username}
                hint="حروف لاتينية وأرقام، ويمكن استخدام . _ -"
                required
              >
                {(id, errorId) => (
                  <input
                    id={id}
                    dir="ltr"
                    required
                    minLength={3}
                    maxLength={80}
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={!!fields.username}
                    aria-describedby={errorId}
                  />
                )}
              </Field>
            )}
            {mode.kind !== "edit" && (
              <Field
                label={
                  mode.kind === "password"
                    ? "كلمة المرور الجديدة"
                    : "كلمة المرور الأولية"
                }
                error={fields.password}
                hint="6 محرفاً على الأقل؛ سلّمها لصاحب الحساب عبر وسيلة آمنة"
                required
              >
                {(id, errorId) => (
                  <PasswordInput
                    id={id}
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    minLength={6}
                    invalid={!!fields.password}
                    describedBy={errorId}
                  />
                )}
              </Field>
            )}
          </fieldset>
          <div className="dialog-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "جارٍ الحفظ…"
                : mode.kind === "password"
                  ? "تأكيد تعيين كلمة المرور"
                  : "حفظ"}
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
export function Municipalities() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // The notice carries the list it belongs to, so a search or page change
  // retires it instead of leaving a stale success message on screen.
  const [notice, setNotice] = useState<{ text: string; key: string } | null>(
    null,
  );
  const [editor, setEditor] = useState<EditMode | null>(null);
  // A status change targets either a municipality or one of its accounts; the
  // page names the target instead of carrying an endpoint path around.
  const [action, setAction] = useState<{
    target: "municipality" | "account";
    id: string;
    active: boolean;
    name: string;
  } | null>(null);
  const debounced = useDebounced(search);
  const data = useMunicipalitiesQuery({ page, search: debounced });
  const [updateMunicipality] = useUpdateMunicipalityMutation();
  const [updateAccount] = useUpdateAccountMutation();
  const key = page + "|" + debounced;
  const shown = notice?.key === key ? notice.text : "";
  return (
    <>
      <PageHeader
        title="البلديات والحسابات"
        subtitle="إدارة البلديات وحسابات اللجان"
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
            تُنشأ البلدية مع حسابها الأول في خطوة واحدة.
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">الاسم</th>
                    <th scope="col">المنطقة</th>
                    <th scope="col">الحسابات</th>
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
                      <td data-label="الحسابات">
                        <div className="account-list">
                          {m.users.map((u) => (
                            <div key={u.id} className="account">
                              <bdi dir="ltr" className="account-name">
                                {u.username}
                              </bdi>
                              <span
                                className={
                                  "badge " +
                                  (u.isActive ? "active" : "inactive")
                                }
                              >
                                {u.isActive ? "مفعّل" : "معطّل"}
                              </span>
                              {u.lastLoginAt && (
                                <small>آخر دخول {dateText(u.lastLoginAt)}</small>
                              )}
                              <div className="row-actions">
                                <button
                                  className="secondary button-small"
                                  onClick={() =>
                                    setEditor({
                                      kind: "password",
                                      user: u,
                                      municipality: m,
                                    })
                                  }
                                >
                                  كلمة مرور جديدة
                                </button>
                                <button
                                  className="secondary button-small"
                                  onClick={() =>
                                    setAction({
                                      target: "account",
                                      id: u.id,
                                      active: !u.isActive,
                                      name: "حساب " + u.username,
                                    })
                                  }
                                >
                                  {u.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
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
                            className="secondary button-small"
                            onClick={() =>
                              setEditor({ kind: "account", municipality: m })
                            }
                          >
                            إضافة حساب
                          </button>
                          <button
                            className={
                              (m.isActive ? "danger" : "secondary") +
                              " button-small"
                            }
                            onClick={() =>
                              setAction({
                                target: "municipality",
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
          onClose={() => setEditor(null)}
          onSaved={() => {
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
            await (action.target === "municipality"
              ? updateMunicipality(args).unwrap()
              : updateAccount(args).unwrap());
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
