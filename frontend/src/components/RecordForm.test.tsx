import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordForm } from "./RecordForm";
import { renderApp, stubFetch } from "../test-utils";
import type { CensusRecord } from "../types";
const existing: CensusRecord = {
  id: "id",
  municipalityId: "m",
  category: "MARTYR",
  personName: "أحمد سعيد حسين",
  maritalStatus: "MARRIED",
  spouseName: "اسم الزوجة",
  nationalId: "00123",
  familyBookNumber: "00456",
  familyMembersCount: 3,
  phone: "0944000000",
  notes: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
  deletedAt: null,
  municipality: { name: "بلدية تجريبية", areaName: "درعا" },
};
/** The JSON body the form actually sent, parsed from the recorded request. */
async function sentBody(index = 0) {
  const call = vi.mocked(fetch).mock.calls[index];
  const request = call[0] as Request;
  return JSON.parse(await request.text()) as Record<string, unknown>;
}
afterEach(() => {
  vi.unstubAllGlobals();
  // Drafts persist across renders by design, so isolate them per test.
  sessionStorage.clear();
});
describe("Record form behavior", () => {
  it("clears a previous spouse when changing to single and preserves identifiers", async () => {
    stubFetch([{ match: "/records/id", body: existing }]);
    const saved = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <RecordForm
        category="MARTYR"
        record={existing}
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "SINGLE");
    expect(
      screen.queryByLabelText("الاسم الثلاثي للزوجة"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    // Leading zeroes survive as strings; the stale-edit guard is sent.
    expect(await sentBody()).toMatchObject({
      spouseName: null,
      maritalStatus: "SINGLE",
      nationalId: "00123",
      familyBookNumber: "00456",
      phone: "0944000000",
      expectedUpdatedAt: existing.updatedAt,
    });
  });
  it("requires a spouse for married and does not send an invalid form", async () => {
    stubFetch([{ match: "/records", body: existing }]);
    const user = userEvent.setup();
    renderApp(
      <RecordForm category="WAR_INJURED" onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    await user.type(
      screen.getByLabelText("الاسم الثلاثي للمصاب"),
      "أحمد سعيد حسين",
    );
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "MARRIED");
    await user.type(screen.getByLabelText("عدد أفراد الأسرة"), "٣");
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    expect(screen.getByText("اسم الزوجة مطلوب للمتزوج")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("normalizes Arabic digits in the family count before sending", async () => {
    stubFetch([{ match: "/records", body: existing }]);
    const saved = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <RecordForm category="MARTYR" onSaved={saved} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "اسم ثلاثي");
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "SINGLE");
    await user.type(screen.getByLabelText("عدد أفراد الأسرة"), "٤");
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(await sentBody()).toMatchObject({ familyMembersCount: 4 });
  });
  it("saves a blank family count as null", async () => {
    stubFetch([{ match: "/records", body: { ...existing, familyMembersCount: null } }]);
    const saved = vi.fn();
    const user = userEvent.setup();
    renderApp(<RecordForm category="MARTYR" onSaved={saved} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "اسم ثلاثي");
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "SINGLE");
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(await sentBody()).toMatchObject({ familyMembersCount: null });
  });
  it.each(["WIDOWED", "DIVORCED"])("saves %s without requiring spouse or family count", async (status) => {
    stubFetch([{ match: "/records", body: existing }]);
    const saved = vi.fn();
    const user = userEvent.setup();
    renderApp(<RecordForm category="WAR_INJURED" onSaved={saved} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("الاسم الثلاثي للمصاب"), "اسم ثلاثي");
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), status);
    expect(screen.getByLabelText("الاسم الثلاثي للزوجة")).not.toBeRequired();
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(await sentBody()).toMatchObject({ maritalStatus: status, familyMembersCount: null });
  });
  it("opens an existing unknown family count as an empty input", () => {
    stubFetch([]);
    renderApp(<RecordForm category="MARTYR" record={{ ...existing, familyMembersCount: null }} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("عدد أفراد الأسرة")).toHaveValue("");
  });
  it("restores an unsent draft after a reload, then can be reset", async () => {
    stubFetch([]);
    const user = userEvent.setup();
    // First visit: type, then leave without saving (a reload or a closed tab).
    const first = renderApp(
      <RecordForm
        category="MARTYR"
        userId="user-1"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("الاسم الثلاثي للشهيد"),
      "أحمد سعيد حسين",
    );
    await user.type(screen.getByLabelText("رقم البطاقة الشخصية"), "00123");
    await waitFor(() =>
      expect(sessionStorage.length).toBeGreaterThan(0),
    );
    first.unmount();
    // Second visit: the typed data comes back.
    renderApp(
      <RecordForm
        category="MARTYR"
        userId="user-1"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("الاسم الثلاثي للشهيد")).toHaveValue(
      "أحمد سعيد حسين",
    );
    expect(screen.getByLabelText("رقم البطاقة الشخصية")).toHaveValue("00123");
    expect(screen.getByText(/تمت استعادة بيانات لم تُحفظ/)).toBeInTheDocument();
    // Starting fresh empties the form and drops the stored draft.
    await user.click(screen.getByRole("button", { name: "بدء نموذج فارغ" }));
    expect(screen.getByLabelText("الاسم الثلاثي للشهيد")).toHaveValue("");
    expect(sessionStorage.length).toBe(0);
  });
  it("keeps one category's draft out of another category's form", async () => {
    stubFetch([]);
    const user = userEvent.setup();
    const first = renderApp(
      <RecordForm
        category="MARTYR"
        userId="user-1"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "أحمد");
    await waitFor(() => expect(sessionStorage.length).toBeGreaterThan(0));
    first.unmount();
    renderApp(
      <RecordForm
        category="EXTREME_POVERTY"
        userId="user-1"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("الاسم الثلاثي للزوج")).toHaveValue("");
  });
  it("does not keep a draft while editing an existing record", async () => {
    stubFetch([]);
    const user = userEvent.setup();
    renderApp(
      <RecordForm
        category="MARTYR"
        record={existing}
        userId="user-1"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("الاسم الثلاثي للشهيد"));
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "اسم جديد");
    // An edit carries a stale-version guard, so a restored draft could push an
    // old version over a newer save. Nothing is stored.
    await waitFor(() => expect(sessionStorage.length).toBe(0));
  });
  it("marks required fields without changing their accessible name", () => {
    stubFetch([]);
    renderApp(
      <RecordForm category="MARTYR" onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    // The marker is CSS generated content, so an exact label lookup still
    // works and assistive technology reads the control's own `required`.
    expect(screen.getByLabelText("الاسم الثلاثي للشهيد")).toBeRequired();
    expect(screen.getByLabelText("عدد أفراد الأسرة")).not.toBeRequired();
    expect(screen.getByLabelText("رقم الجوال")).not.toBeRequired();
    expect(screen.getByLabelText("ملاحظات")).not.toBeRequired();
  });
  it("poverty has an optional spouse and no marital field", () => {
    stubFetch([]);
    renderApp(
      <RecordForm
        category="EXTREME_POVERTY"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("الحالة الاجتماعية")).not.toBeInTheDocument();
    expect(screen.getByLabelText("الاسم الثلاثي للزوجة")).not.toBeRequired();
  });
  it("warns before discarding a dirty form", async () => {
    stubFetch([]);
    const user = userEvent.setup();
    const close = vi.fn();
    renderApp(
      <RecordForm category="MARTYR" onSaved={vi.fn()} onClose={close} />,
    );
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "اسم");
    await user.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.getByText("تجاهل التعديلات؟")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "إغلاق دون حفظ" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("shows the backend field error inline and keeps the entered values", async () => {
    stubFetch([
      {
        match: "/records",
        status: 409,
        body: {
          code: "DUPLICATE",
          message: "يوجد سجل بنفس رقم البطاقة في هذه البلدية",
          fields: { nationalId: "رقم البطاقة مستخدم مسبقاً" },
        },
      },
    ]);
    const saved = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <RecordForm category="MARTYR" onSaved={saved} onClose={vi.fn()} />,
    );
    await user.type(screen.getByLabelText("الاسم الثلاثي للشهيد"), "اسم ثلاثي");
    await user.selectOptions(screen.getByLabelText("الحالة الاجتماعية"), "SINGLE");
    await user.type(screen.getByLabelText("عدد أفراد الأسرة"), "2");
    await user.type(screen.getByLabelText("رقم البطاقة الشخصية"), "00123");
    await user.click(screen.getByRole("button", { name: "حفظ السجل" }));
    expect(
      await screen.findByText("رقم البطاقة مستخدم مسبقاً"),
    ).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("رقم البطاقة الشخصية")).toHaveValue("00123");
  });
});
