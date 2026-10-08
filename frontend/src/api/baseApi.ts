import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import { API_URL } from "../config";
import { toApiFailure } from "./errors";
import type { ApiFailure } from "./errors";

/** Paired with the backend origin check; required on every unsafe request. */
const CSRF_HEADER = "X-Count-Daraa";

/**
 * Cache tags. Every endpoint declares what it provides or invalidates, so a
 * mutation refreshes exactly the affected lists and nothing hand-maintains a
 * list of cache keys.
 */
export const tagTypes = [
  "Session",
  "Record",
  "Summary",
  "Municipality",
  "MunicipalityOption",
  "Area",
  "Import",
  "Audit",
] as const;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  credentials: "same-origin",
  prepareHeaders: (headers) => {
    headers.set(CSRF_HEADER, "1");
    return headers;
  },
});

/**
 * The single transport for every endpoint. It wraps `fetchBaseQuery` to
 * normalize failures into {@link ApiFailure}, so no component ever inspects a
 * raw status or a backend envelope.
 *
 * `fetchBaseQuery` sets the JSON content type for a plain `body` and leaves it
 * unset for `FormData`, which is required: the browser must generate the
 * multipart boundary itself.
 */
export const baseQuery: BaseQueryFn<
  Parameters<typeof rawBaseQuery>[0],
  unknown,
  ApiFailure
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (!result.error) return { data: result.data };
  const { error } = result;
  // FETCH_ERROR / PARSING_ERROR / TIMEOUT_ERROR carry no HTTP status.
  if (typeof error.status !== "number") {
    return { error: toApiFailure(0, {}) };
  }
  return { error: toApiFailure(error.status, error.data) };
};

/**
 * The base API. Every area module extends it with `injectEndpoints`, so there
 * is one cache, one middleware and one reducer regardless of how many modules
 * exist.
 *
 * `refetchOnMountOrArgChange` is in seconds and plays the role the previous
 * client's stale time did.
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes,
  refetchOnMountOrArgChange: 15,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});

/** Clears every cached response. Used on sign-in, sign-out and session loss. */
export const resetApiState = baseApi.util.resetApiState;
