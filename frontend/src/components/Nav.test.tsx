import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { BottomBar, Sidebar } from "./Nav";
import { navItems } from "./navItems";
import { renderApp } from "../test-utils";
import type { User } from "../types";
const municipalityUser: User = {
  id: "u",
  username: "committee",
  role: "MUNICIPALITY",
  municipalityId: "m",
  municipality: { id: "m", name: "بلدية جاسم", areaName: "درعا", isActive: true },
};
const adminUser: User = {
  id: "a",
  username: "daraa_count_admin",
  role: "SUPER_ADMIN",
  municipalityId: null,
  municipality: null,
};
it("gives a municipality its home and its three categories only", () => {
  const items = navItems(municipalityUser);
  expect(items.map((i) => i.to)).toEqual([
    "/",
    "/martyrs",
    "/injured",
    "/poverty",
  ]);
  // No administrator destination is reachable from a municipality's navigation.
  expect(items.every((i) => !i.to.startsWith("/admin"))).toBe(true);
});
it("gives an administrator the five management sections", () => {
  const items = navItems(adminUser);
  expect(items.map((i) => i.to)).toEqual([
    "/admin",
    "/admin/municipalities",
    "/admin/records",
    "/admin/imports",
    "/admin/audit",
  ]);
});
it("renders the sidebar with full labels", () => {
  renderApp(<Sidebar items={navItems(municipalityUser)} />);
  const nav = screen.getByRole("navigation", { name: "التنقل الرئيسي" });
  expect(nav).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "شهداء الثورة" })).toHaveAttribute(
    "href",
    "/martyrs",
  );
  expect(screen.getByRole("link", { name: "الصفحة الرئيسية" })).toBeVisible();
});
it("renders the bottom bar with short labels and the same destinations", () => {
  const items = navItems(municipalityUser);
  renderApp(<BottomBar items={items} />);
  for (const item of items) {
    expect(
      screen.getByRole("link", { name: new RegExp(item.short) }),
    ).toHaveAttribute("href", item.to);
  }
});
