import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Records } from "./Records";
import { renderApp, stubFetch } from "../test-utils";
import type { Category, User } from "../types";
const municipalityUser: User = {
  id: "u",
  username: "committee",
  role: "MUNICIPALITY",
  municipalityId: "m",
  municipality: {
    id: "m",
    name: "بلدية جاسم",
    areaName: "درعا",
    isActive: true,
  },
};
const emptyPage = { items: [], total: 0, page: 1, pageSize: 25 };
function ShowLocation() {
  return <output data-testid="url">{useLocation().search}</output>;
}
function renderRecords(route = "/martyrs", category: Category = "MARTYR") {
  return renderApp(
    <Routes>
      <Route
        path="/martyrs"
        element={
          <>
            <Records user={municipalityUser} category={category} />
            <ShowLocation />
          </>
        }
      />
    </Routes>,
    route,
  );
}
afterEach(() => vi.unstubAllGlobals());
it("filters by marital status, resets pagination, and allows clearing the selection", async () => {
  const calls = stubFetch([{ match: "/records?", body: emptyPage }]);
  const user = userEvent.setup();
  renderRecords("/martyrs?page=4");
  await user.selectOptions(
    screen.getByLabelText("الحالة الاجتماعية"),
    "SINGLE",
  );
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.url.includes("maritalStatus=SINGLE") && c.url.includes("page=1"),
      ),
    ).toBe(true),
  );
  expect(screen.getByTestId("url").textContent).toContain(
    "maritalStatus=SINGLE",
  );
  expect(
    await screen.findByText(/جرّب حالة اجتماعية أخرى/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إضافة أول سجل" }),
  ).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "");
  await waitFor(() =>
    expect(screen.getByTestId("url").textContent).not.toContain(
      "maritalStatus",
    ),
  );
  await waitFor(() =>
    expect(new URL(calls.at(-1)!.url).searchParams.has("maritalStatus")).toBe(
      false,
    ),
  );
});
it("restores the marital filter from a shared URL", async () => {
  const calls = stubFetch([{ match: "/records?", body: emptyPage }]);
  renderRecords("/martyrs?maritalStatus=MARRIED");
  expect(screen.getByLabelText("الحالة الاجتماعية")).toHaveValue("MARRIED");
  await waitFor(() =>
    expect(calls.some((c) => c.url.includes("maritalStatus=MARRIED"))).toBe(
      true,
    ),
  );
});
it("has no marital filter for poverty and ignores a stale status in the URL", async () => {
  const calls = stubFetch([{ match: "/records?", body: emptyPage }]);
  renderRecords("/martyrs?maritalStatus=MARRIED", "EXTREME_POVERTY");
  expect(screen.queryByLabelText("الحالة الاجتماعية")).not.toBeInTheDocument();
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  expect(calls.every((c) => !c.url.includes("maritalStatus"))).toBe(true);
});
it("keeps the search term in the URL so a reload preserves it", async () => {
  const calls = stubFetch([{ match: "/records?", body: emptyPage }]);
  const user = userEvent.setup();
  renderRecords();
  await screen.findByRole("heading", { name: "شهداء الثورة" });
  await user.type(screen.getByLabelText("بحث"), "أحمد");
  await waitFor(() =>
    expect(screen.getByTestId("url").textContent).toContain(
      "search=" + encodeURIComponent("أحمد"),
    ),
  );
  await waitFor(() =>
    expect(calls.some((c) => c.url.includes("search=%D8%A3"))).toBe(true),
  );
});
it("never sends a municipality filter from a municipality interface", async () => {
  const calls = stubFetch([{ match: "/records?", body: emptyPage }]);
  renderRecords();
  await screen.findByRole("heading", { name: "شهداء الثورة" });
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  expect(calls.every((c) => !c.url.includes("municipalityId"))).toBe(true);
  // The administrator-only options lookup must not be requested either.
  expect(calls.every((c) => !c.path.includes("/admin/"))).toBe(true);
});
it("offers no municipality or deleted filter, and no restore column", async () => {
  stubFetch([{ match: "/records?", body: emptyPage }]);
  renderRecords();
  await screen.findByRole("heading", { name: "شهداء الثورة" });
  expect(screen.queryByLabelText("البلدية")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("حالة السجلات")).not.toBeInTheDocument();
});
it("explains an empty search differently from an empty category", async () => {
  stubFetch([{ match: "/records?", body: emptyPage }]);
  const user = userEvent.setup();
  renderRecords();
  expect(await screen.findByText(/ابدأ بإضافة سجل/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("بحث"), "لا يوجد");
  expect(await screen.findByText(/جرّب كلمة أقصر/)).toBeInTheDocument();
});
