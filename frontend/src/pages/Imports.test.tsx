import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Imports } from "./Imports";
import { renderApp, stubFetch } from "../test-utils";
import type { ImportPreview } from "../types";

afterEach(() => vi.unstubAllGlobals());

const validPreview: ImportPreview = {
  totalRows: 1,
  validRows: 1,
  invalidRows: 0,
  duplicateRows: 0,
  errors: [],
  warnings: [],
  sample: [{ row: 2, personName: "اسم تجريبي", familyMembersCount: null }],
  canConfirm: true,
};

async function review(preview: ImportPreview) {
  stubFetch([
    { match: "/municipalities/options", body: [{ id: "m", name: "بلدية تجريبية", areaName: "درعا", isActive: true }] },
    { match: "/imports/preview", body: preview },
    { match: "/imports?page=", body: { items: [], total: 0, page: 1, pageSize: 25 } },
  ]);
  const user = userEvent.setup();
  renderApp(<Imports />);
  await screen.findByRole("option", { name: "بلدية تجريبية" });
  await user.selectOptions(screen.getByLabelText("البلدية"), "m");
  await user.upload(screen.getByLabelText("ملف Excel"), new File(["test"], "records.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  // jsdom does not reproduce native file-input constraint validation.
  // Submit the selected form directly while exercising the real API hooks.
  fireEvent.submit(screen.getByRole("button", { name: "معاينة الملف" }).closest("form")!);
  return { user, button: await screen.findByRole("button", { name: /تأكيد استيراد/ }) };
}

it("enables import confirmation when valid rows have blank family counts", async () => {
  const { user, button } = await review(validPreview);
  expect(button).toBeEnabled();
  expect(screen.getByText("—")).toBeInTheDocument();
  await user.click(button);
  expect(screen.getByRole("button", { name: "استيراد الآن" })).toBeEnabled();
});

it("explains why row errors disable import confirmation", async () => {
  const { button } = await review({ ...validPreview, invalidRows: 1, canConfirm: false, errors: [{ row: 3, message: "اسم مطلوب" }] });
  expect(button).toBeDisabled();
  expect(screen.getByText(/الاستيراد غير متاح لوجود أخطاء/)).toBeInTheDocument();
});

it("explains why an all-duplicate workbook cannot add new records", async () => {
  const { button } = await review({ ...validPreview, validRows: 0, duplicateRows: 1, sample: [] });
  expect(button).toBeDisabled();
  expect(screen.getByText(/لا توجد سجلات جديدة للاستيراد/)).toBeInTheDocument();
});
