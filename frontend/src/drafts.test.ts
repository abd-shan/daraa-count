import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAllDrafts,
  clearDraft,
  readDraft,
  saveDraft,
} from "./drafts";
afterEach(() => {
  // Unstub first: a test may have replaced storage with a throwing stub.
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});
describe("form drafts", () => {
  it("returns a saved draft to the same user and form", () => {
    saveDraft("user-1", "record:MARTYR", { personName: "أحمد سعيد حسين" });
    expect(readDraft("user-1", "record:MARTYR")).toEqual({
      personName: "أحمد سعيد حسين",
    });
  });
  it("never leaks a draft to another account on the same machine", () => {
    saveDraft("user-1", "record:MARTYR", { personName: "أحمد" });
    expect(readDraft("user-2", "record:MARTYR")).toBeNull();
  });
  it("keeps drafts of different forms apart", () => {
    saveDraft("user-1", "record:MARTYR", { personName: "أحمد" });
    expect(readDraft("user-1", "record:EXTREME_POVERTY")).toBeNull();
  });
  it("expires an abandoned draft and removes it from storage", () => {
    vi.useFakeTimers();
    saveDraft("user-1", "record:MARTYR", { personName: "أحمد" });
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(readDraft("user-1", "record:MARTYR")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("drops one draft on clearDraft", () => {
    saveDraft("user-1", "a", { x: 1 });
    saveDraft("user-1", "b", { x: 2 });
    clearDraft("user-1", "a");
    expect(readDraft("user-1", "a")).toBeNull();
    expect(readDraft("user-1", "b")).toEqual({ x: 2 });
  });
  it("drops every user's drafts on sign-out", () => {
    saveDraft("user-1", "a", { x: 1 });
    saveDraft("user-2", "b", { x: 2 });
    sessionStorage.setItem("unrelated-key", "keep me");
    clearAllDrafts();
    expect(readDraft("user-1", "a")).toBeNull();
    expect(readDraft("user-2", "b")).toBeNull();
    // Only this feature's keys are touched.
    expect(sessionStorage.getItem("unrelated-key")).toBe("keep me");
  });
  it("discards a malformed entry instead of letting it linger", () => {
    sessionStorage.setItem("count-daraa.draft.user-1.a", "{ not json");
    expect(readDraft("user-1", "a")).toBeNull();
    expect(sessionStorage.getItem("count-daraa.draft.user-1.a")).toBeNull();
  });
  it("is inert when storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      get length(): number {
        throw new Error("blocked");
      },
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
      key() {
        throw new Error("blocked");
      },
      clear() {
        throw new Error("blocked");
      },
    });
    expect(() => saveDraft("user-1", "a", { x: 1 })).not.toThrow();
    expect(readDraft("user-1", "a")).toBeNull();
    expect(() => clearDraft("user-1", "a")).not.toThrow();
    expect(() => clearAllDrafts()).not.toThrow();
  });
});
