import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Login } from "./Login";
import { renderApp, stubFetch } from "../test-utils";
afterEach(() => vi.unstubAllGlobals());
it("reveals and hides the password through the toggle", async () => {
  stubFetch([]);
  const user = userEvent.setup();
  renderApp(<Login />);
  const password = screen.getByLabelText("كلمة المرور");
  expect(password).toHaveAttribute("type", "password");
  const toggle = screen.getByRole("button", { name: "إظهار كلمة المرور" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  await user.click(toggle);
  expect(password).toHaveAttribute("type", "text");
  // The label flips so the button always states what it will do next.
  const hide = screen.getByRole("button", { name: "إخفاء كلمة المرور" });
  expect(hide).toHaveAttribute("aria-pressed", "true");
  await user.click(hide);
  expect(password).toHaveAttribute("type", "password");
});
it("does not submit the form when the toggle is pressed", async () => {
  const calls = stubFetch([]);
  const user = userEvent.setup();
  renderApp(<Login />);
  await user.type(screen.getByLabelText("اسم المستخدم"), "committee");
  await user.type(screen.getByLabelText("كلمة المرور"), "secret-value");
  await user.click(screen.getByRole("button", { name: "إظهار كلمة المرور" }));
  expect(calls).toHaveLength(0);
});
it("keeps the username but clears the password after a failed sign-in", async () => {
  stubFetch([
    {
      match: "/auth/login",
      status: 401,
      body: { message: "بيانات الدخول غير صحيحة" },
    },
  ]);
  const user = userEvent.setup();
  renderApp(<Login />);
  await user.type(screen.getByLabelText("اسم المستخدم"), "committee");
  await user.type(screen.getByLabelText("كلمة المرور"), "wrong-password");
  await user.click(screen.getByRole("button", { name: "دخول" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "بيانات الدخول غير صحيحة",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("كلمة المرور")).toHaveValue(""),
  );
  expect(screen.getByLabelText("اسم المستخدم")).toHaveValue("committee");
});
it("never writes anything from the sign-in form to storage", async () => {
  stubFetch([]);
  const user = userEvent.setup();
  renderApp(<Login />);
  await user.type(screen.getByLabelText("اسم المستخدم"), "committee");
  await user.type(screen.getByLabelText("كلمة المرور"), "secret-value");
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
});
