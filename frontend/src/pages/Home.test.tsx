import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Home } from "./Home";
import { renderApp, stubFetch } from "../test-utils";
import type { User } from "../types";
const municipalityUser: User = {
  id: "a",
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
afterEach(() => vi.unstubAllGlobals());
it("shows three municipality category cards and no import action", async () => {
  stubFetch([
    {
      match: "/records/summary",
      body: { counts: { MARTYR: 125, WAR_INJURED: 6, EXTREME_POVERTY: 14 } },
    },
  ]);
  renderApp(<Home user={municipalityUser} />);
  expect(
    await screen.findByRole("link", { name: /شهداء الثورة/ }),
  ).toHaveAttribute("href", "/martyrs");
  expect(screen.getByRole("link", { name: /مصابو الحرب/ })).toHaveAttribute(
    "href",
    "/injured",
  );
  expect(screen.getByRole("link", { name: /الأشد فقراً/ })).toHaveAttribute(
    "href",
    "/poverty",
  );
  expect(screen.queryByText("استيراد Excel")).not.toBeInTheDocument();
  expect(screen.getByText("بلدية جاسم")).toBeInTheDocument();
  // Western digits, matching the identifiers and the Excel exports.
  expect(screen.getByText("125")).toBeInTheDocument();
});
it("renders zero counts rather than an empty card", async () => {
  stubFetch([{ match: "/records/summary", body: { counts: {} } }]);
  renderApp(<Home user={municipalityUser} />);
  expect(await screen.findByRole("link", { name: /شهداء الثورة/ })).toBeVisible();
  expect(screen.getAllByText("0")).toHaveLength(3);
});
it("shows an Arabic error and a retry action when the summary fails", async () => {
  stubFetch([{ match: "/records/summary", status: 500, body: {} }]);
  renderApp(<Home user={municipalityUser} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر");
  expect(
    screen.getByRole("button", { name: "إعادة المحاولة" }),
  ).toBeInTheDocument();
});
