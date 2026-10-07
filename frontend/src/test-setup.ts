import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
afterEach(cleanup);

/**
 * jsdom does not implement the dialog element's modal behavior, so the
 * attribute is toggled directly for the shared Dialog component.
 */
HTMLDialogElement.prototype.showModal = vi.fn(function (
  this: HTMLDialogElement,
) {
  this.setAttribute("open", "");
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

/**
 * Browsers accept a relative URL in `new Request(...)` and resolve it against
 * the document. The `Request` vitest exposes comes from Node's undici, which
 * throws on one. RTK Query's `fetchBaseQuery` builds a Request from the
 * relative API prefix, so relative inputs are resolved here.
 *
 * Test-only: production runs in a browser, where no shim is needed.
 */
const NodeRequest = globalThis.Request;
class RelativeUrlRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === "string" && input.startsWith("/")
        ? new URL(input, location.origin).href
        : input,
      init,
    );
  }
}
globalThis.Request = RelativeUrlRequest as typeof globalThis.Request;
