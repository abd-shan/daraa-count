/**
 * Builds a query string, dropping undefined and empty values so an unused
 * filter never reaches the backend.
 */
export function searchParams(
  values: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}
