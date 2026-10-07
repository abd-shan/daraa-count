/**
 * Frontend configuration, read once from Vite's build-time environment.
 *
 * `VITE_API_URL` is the API prefix. It must resolve to the SAME ORIGIN the
 * application is served from, because the backend is deliberately not a
 * cross-origin API:
 *
 *   - the session cookie is host-only with `SameSite=Strict`, so a browser
 *     will not attach it to a request for a different origin;
 *   - the backend enables no CORS and rejects unsafe requests whose `Origin`
 *     does not equal its configured `APP_ORIGIN`.
 *
 * A relative prefix such as `/api` satisfies this in every environment: Vite
 * proxies it in development and Nginx proxies it in production. An absolute
 * URL is accepted only when it points at the current origin, which is useful
 * for serving the API under a different path on the same host.
 *
 * Pointing this at another host requires backend CORS and a cookie policy
 * change, neither of which this deployment has; `assertSameOrigin` below
 * fails fast instead of letting that surface as a mysterious 403 at login.
 */
const DEFAULT_API_URL = "/api";

function readApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  const value = configured || DEFAULT_API_URL;
  // A trailing slash would produce `//records` once a path is appended.
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const API_URL = readApiUrl();

/**
 * Throws when `VITE_API_URL` names a different origin. Called from the entry
 * point so a misconfigured build fails immediately and visibly.
 */
export function assertSameOrigin(apiUrl = API_URL, origin = location.origin) {
  let parsed: URL;
  try {
    parsed = apiUrl.startsWith("/") ? new URL(apiUrl, origin) : new URL(apiUrl);
  } catch {
    throw new Error(
      `VITE_API_URL must be a path such as "/api" or an absolute URL, got "${apiUrl}"`,
    );
  }
  if (parsed.origin !== origin) {
    throw new Error(
      `VITE_API_URL points at ${parsed.origin}, but the application is served ` +
        `from ${origin}. The session cookie is host-only and the backend ` +
        `enables no CORS, so a cross-origin API cannot authenticate. Use a ` +
        `same-origin path such as "/api" and let the reverse proxy forward it.`,
    );
  }
}
