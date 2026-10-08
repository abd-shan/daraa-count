import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Municipalities } from "./Municipalities";
import { renderApp, stubFetch } from "../test-utils";

const municipality = {
  id: "m",
  name: "بلدية اختبار",
  areaName: "درعا",
  isActive: true,
  _count: { records: 0 },
};
const page = { items: [municipality], total: 1, page: 1, pageSize: 25 };
function prepare(areas = ["إزرع", "الصنمين", "درعا"], saveStatus = 200) {
  return stubFetch([
    { match: "/admin/areas", body: areas },
    { match: "/admin/municipalities?", body: page },
    {
      match: "/admin/municipalities",
      status: saveStatus,
      body: saveStatus === 200 ? municipality : { message: "البلدية موجودة" },
    },
  ]);
}
afterEach(() => vi.unstubAllGlobals());
it("creates a municipality with just its name and area, then retains the last saved area", async () => {
  const calls = prepare();
  const user = userEvent.setup();
  renderApp(<Municipalities />);
  await user.click(screen.getByRole("button", { name: "إضافة بلدية" }));
  expect(screen.queryByLabelText("اسم المستخدم")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("اسم البلدية"), "بلدية جديدة");
  await user.click(screen.getByLabelText("المنطقة"));
  await user.click(await screen.findByRole("option", { name: "درعا" }));
  await user.click(screen.getByRole("button", { name: "حفظ" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  const submitted = vi
    .mocked(fetch)
    .mock.calls.map((call) => call[0])
    .find(
      (input) => input instanceof Request && input.method === "POST",
    ) as Request;
  expect(await submitted.json()).toEqual({
    name: "بلدية جديدة",
    areaName: "درعا",
  });
  expect(
    calls.filter((call) => call.path.endsWith("/admin/areas")).length,
  ).toBeGreaterThan(1);
  await user.click(screen.getByRole("button", { name: "إضافة بلدية" }));
  expect(screen.getByLabelText("اسم البلدية")).toHaveValue("");
  expect(screen.getByLabelText("المنطقة")).toHaveValue("درعا");
  await user.click(screen.getByRole("button", { name: "إلغاء" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows saved areas under the input, filters them and supports keyboard selection", async () => {
  prepare();
  const user = userEvent.setup();
  renderApp(<Municipalities />);
  await user.click(screen.getByRole("button", { name: "إضافة بلدية" }));
  const input = screen.getByRole("combobox", { name: "المنطقة" });
  await user.click(input);
  const list = await screen.findByRole("listbox", { name: "المناطق المحفوظة" });
  expect(
    within(list)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["إزرع", "الصنمين", "درعا"]);
  await user.type(input, "الص");
  expect(screen.getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(input).toHaveValue("الصنمين");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("اسم البلدية"));
  await user.click(input);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
it("accepts a new area and preserves typed data when saving fails", async () => {
  prepare([], 409);
  const user = userEvent.setup();
  renderApp(<Municipalities />);
  await user.click(screen.getByRole("button", { name: "إضافة بلدية" }));
  await user.type(screen.getByLabelText("اسم البلدية"), "بلدية جديدة");
  await user.type(screen.getByLabelText("المنطقة"), "منطقة جديدة");
  await user.click(screen.getByRole("button", { name: "حفظ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("البلدية موجودة");
  expect(screen.getByLabelText("اسم البلدية")).toHaveValue("بلدية جديدة");
  expect(screen.getByLabelText("المنطقة")).toHaveValue("منطقة جديدة");
});
it("shows municipality records and actions without account controls", async () => {
  prepare();
  renderApp(<Municipalities />);
  await screen.findByRole("rowheader", { name: "بلدية اختبار" });
  expect(
    screen.queryByRole("columnheader", { name: "الحسابات" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إضافة حساب" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "تعديل البلدية" }),
  ).toBeInTheDocument();
});
