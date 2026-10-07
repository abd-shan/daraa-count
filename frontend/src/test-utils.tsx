import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { createStore } from "./store";

/**
 * Renders with a fresh store and router, so each test exercises the real
 * base API — its transport, cache tags and error mapping — against a stubbed
 * `fetch` rather than against mocked hooks.
 */
export function renderApp(ui: ReactNode, route = "/") {
  const store = createStore();
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { ...result, store };
}

export interface StubRoute {
  /** Matched against the request URL with `includes`. */
  match: string;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FetchCall {
  /** Absolute URL; jsdom resolves the relative API prefix against the origin. */
  url: string;
  /** Path only, which is what assertions about the API prefix care about. */
  path: string;
  method: string;
  headers: Headers;
}

/**
 * Replaces global fetch with a tiny router. Returns the recorded calls so a
 * test can assert exactly what reached the network.
 *
 * `fetchBaseQuery` calls fetch with a single `Request`, not a url/init pair,
 * so both shapes are unpacked here.
 */
export function stubFetch(routes: StubRoute[]) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(
    (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      calls.push({
        url,
        path: new URL(url, location.origin).pathname,
        method: request?.method ?? init?.method ?? "GET",
        headers: request
          ? request.headers
          : new Headers(init?.headers as HeadersInit),
      });
      const route = routes.find((r) => url.includes(r.match));
      const status = route?.status ?? (route ? 200 : 404);
      const headers = new Headers(route?.headers ?? {});
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        headers,
        json: () => Promise.resolve(route?.body ?? {}),
        text: () => Promise.resolve(JSON.stringify(route?.body ?? {})),
        blob: () => Promise.resolve(new Blob(["x"])),
        clone() {
          return this;
        },
      } as unknown as Response);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
