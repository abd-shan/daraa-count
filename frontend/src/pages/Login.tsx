import { useState } from "react";
import type { FormEvent } from "react";
import { errorMessage, resetApiState, useLoginMutation } from "../api";
import { useAppDispatch } from "../store";
import { Field, Notice, PasswordInput } from "../components/ui";
export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setError("");
    try {
      await login({ username, password }).unwrap();
      // Start the new session from an empty cache, then let the session query
      // refetch so the shell renders from the server's answer.
      dispatch(resetApiState());
    } catch (e) {
      // The username is kept so only the password needs retyping.
      setPassword("");
      setError(errorMessage(e, "تعذر تسجيل الدخول"));
    }
  }
  return (
    <main className="login-layout">
      <div className="login-intro">
        <h1> منصة الإحصاء </h1>
        {/*<p>إدخال ومتابعة بيانات اللجان البلدية بثلاث فئات واضحة.</p>*/}
      </div>
      <section className="login-panel">
        <h2>تسجيل الدخول</h2>
        {error && <Notice>{error}</Notice>}
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={isLoading}>
            <Field label="اسم المستخدم" required>
              {(id) => (
                <input
                  id={id}
                  dir="ltr"
                  autoComplete="username"
                  autoFocus
                  required
                  maxLength={80}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
            </Field>
            <Field label="كلمة المرور" required>
              {(id) => (
                <PasswordInput
                  id={id}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              )}
            </Field>
          </fieldset>
          <button className="primary full-width" disabled={isLoading}>
            {isLoading ? "جارٍ تسجيل الدخول…" : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
