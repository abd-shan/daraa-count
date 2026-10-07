import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "../store";
import { authApi } from "./auth";
import { recordsApi } from "./records";
import { errorFields, errorMessage, errorRows, toApiFailure } from "./errors";
import { searchParams } from "./searchParams";
import { stubFetch } from "../test-utils";
import { API_URL, assertSameOrigin } from "../config";
import { saveDraft } from "../drafts";
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe("base API transport", () => {
  it("sends relative same-origin requests with the origin-check header", async () => {
    const calls = stubFetch([
      { match: "/records/summary", body: { counts: {} } },
    ]);
    const store = createStore();
    await store.dispatch(recordsApi.endpoints.summary.initiate());
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(API_URL + "/records/summary");
    // Same-origin is the whole point: the session cookie is host-only.
    expect(new URL(calls[0].url).origin).toBe(location.origin);
    expect(calls[0].headers.get("X-Count-Daraa")).toBe("1");
  });
  it("drops empty filters from a record query", async () => {
    const calls = stubFetch([
      {
        match: "/records?",
        body: { items: [], total: 0, page: 1, pageSize: 25 },
      },
    ]);
    const store = createStore();
    await store.dispatch(
      recordsApi.endpoints.records.initiate({
        category: "MARTYR",
        page: 1,
        search: "",
        deleted: false,
      }),
    );
    expect(calls[0].url).not.toContain("search=");
    expect(calls[0].url).not.toContain("municipalityId");
    expect(calls[0].url).not.toContain("maritalStatus");
    expect(calls[0].url).toContain("category=MARTYR");
  });
  it("sends the selected marital status to the records API", async () => {
    const calls = stubFetch([
      {
        match: "/records?",
        body: { items: [], total: 0, page: 1, pageSize: 25 },
      },
    ]);
    const store = createStore();
    await store.dispatch(
      recordsApi.endpoints.records.initiate({
        category: "MARTYR",
        page: 1,
        search: "",
        deleted: false,
        maritalStatus: "MARRIED",
      }),
    );
    expect(new URL(calls[0].url).searchParams.get("maritalStatus")).toBe(
      "MARRIED",
    );
  });
});
describe("session endpoint", () => {
  it("treats a 401 as signed out rather than an error", async () => {
    stubFetch([{ match: "/auth/me", status: 401, body: {} }]);
    const store = createStore();
    const result = await store.dispatch(authApi.endpoints.session.initiate());
    expect(result.isError).toBe(false);
    expect(result.data).toBeNull();
  });
  it("still reports a non-401 failure as an error", async () => {
    stubFetch([{ match: "/auth/me", status: 500, body: {} }]);
    const store = createStore();
    const result = await store.dispatch(authApi.endpoints.session.initiate());
    expect(result.isError).toBe(true);
  });
});
describe("session guard", () => {
  it("clears cached census data and drafts when a session refetch signs out", async () => {
    stubFetch([
      {
        match: "/auth/me",
        body: { id: "u", username: "a", role: "MUNICIPALITY" },
      },
      { match: "/records/summary", body: { counts: { MARTYR: 1 } } },
    ]);
    const store = createStore();
    await store.dispatch(
      authApi.endpoints.session.initiate(undefined, { subscribe: false }),
    );
    await store.dispatch(
      recordsApi.endpoints.summary.initiate(undefined, { subscribe: false }),
    );
    saveDraft("u", "record:new:MARTYR", { personName: "اسم مصطنع" });
    expect(sessionStorage.length).toBe(1);
    stubFetch([{ match: "/auth/me", status: 401 }]);
    await store.dispatch(
      authApi.endpoints.session.initiate(undefined, {
        forceRefetch: true,
        subscribe: false,
      }),
    );
    expect(
      recordsApi.endpoints.summary.select()(store.getState()).data,
    ).toBeUndefined();
    expect(
      authApi.endpoints.session.select()(store.getState()).data,
    ).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });
  it("clears abandoned drafts on an initial signed-out session check", async () => {
    saveDraft("u", "record:new:MARTYR", { personName: "اسم مصطنع" });
    stubFetch([{ match: "/auth/me", status: 401 }]);
    const store = createStore();
    const result = await store.dispatch(authApi.endpoints.session.initiate());
    expect(result.data).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("clears the cache the first time a request returns 401", async () => {
    stubFetch([
      {
        match: "/auth/me",
        body: { id: "u", username: "a", role: "MUNICIPALITY" },
      },
      { match: "/records/summary", status: 401, body: {} },
    ]);
    const store = createStore();
    await store.dispatch(authApi.endpoints.session.initiate());
    expect(
      authApi.endpoints.session.select()(store.getState()).data,
    ).toBeTruthy();
    await store.dispatch(recordsApi.endpoints.summary.initiate());
    // resetApiState wiped the cached session, so the shell drops to sign-in.
    expect(
      authApi.endpoints.session.select()(store.getState()).data,
    ).toBeUndefined();
  });
});
describe("error normalization", () => {
  it("keeps row-level import errors so the confirmation can show them", () => {
    const failure = toApiFailure(400, {
      code: "INVALID_WORKBOOK",
      message: "لا يمكن استيراد ملف يحتوي أخطاء",
      errors: [{ row: 4, message: "الاسم مطلوب" }],
    });
    expect(failure.code).toBe("INVALID_WORKBOOK");
    expect(errorRows(failure)).toEqual([{ row: 4, message: "الاسم مطلوب" }]);
  });
  it("keeps field errors and defaults rows to empty", () => {
    const failure = toApiFailure(422, {
      fields: { personName: "الاسم مطلوب" },
    });
    expect(errorFields(failure)).toEqual({ personName: "الاسم مطلوب" });
    expect(errorRows(failure)).toEqual([]);
  });
  it("supplies an Arabic message when the backend sends none", () => {
    expect(errorMessage(toApiFailure(401, {}))).toContain("انتهت جلسة الدخول");
    expect(errorMessage(toApiFailure(403, {}))).toContain("ليس لديك صلاحية");
    expect(errorMessage(toApiFailure(0, {}))).toContain("تعذر الاتصال بالخادم");
  });
  it("reports a transport failure as status 0 through the base query", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    const store = createStore();
    const result = await store.dispatch(
      recordsApi.endpoints.summary.initiate(),
    );
    expect(result.isError).toBe(true);
    expect(errorMessage(result.error)).toContain("تعذر الاتصال بالخادم");
  });
});
describe("searchParams", () => {
  it("drops undefined and empty values so unused filters never appear", () => {
    const params = searchParams({
      category: "MARTYR",
      page: 1,
      search: "",
      deleted: false,
      municipalityId: undefined,
    });
    expect(params.toString()).toBe("category=MARTYR&page=1&deleted=false");
  });
});
describe("VITE_API_URL validation", () => {
  it("rejects protocol-relative and slash-backslash cross-origin URLs", () => {
    expect(() =>
      assertSameOrigin("//other.example/api", "https://census.example"),
    ).toThrow();
    expect(() =>
      assertSameOrigin("/\\other.example/api", "https://census.example"),
    ).toThrow();
  });
  it("accepts a relative prefix", () => {
    expect(() => assertSameOrigin("/api", "https://app.example")).not.toThrow();
  });
  it("accepts an absolute URL on the same origin", () => {
    expect(() =>
      assertSameOrigin("https://app.example/api", "https://app.example"),
    ).not.toThrow();
  });
  it("rejects a cross-origin API that could not carry the session cookie", () => {
    expect(() =>
      assertSameOrigin("https://api.example", "https://app.example"),
    ).toThrow(/cross-origin API cannot authenticate/);
  });
  it("rejects a value that is neither a path nor a URL", () => {
    expect(() =>
      assertSameOrigin("api.example", "https://app.example"),
    ).toThrow(/must be a path/);
  });
});
