/**
 * The frontend API layer, built on RTK Query.
 *
 *   baseApi.ts        createApi: the shared transport, cache and tag types
 *   errors.ts         ApiFailure plus errorMessage/errorFields/errorRows
 *   searchParams.ts   query-string builder that drops empty filters
 *   auth.ts           /auth/*
 *   records.ts        /records/*            (both roles, municipality-scoped)
 *   municipalities.ts /admin/municipalities/*, /admin/areas  (SUPER_ADMIN)
 *   imports.ts        /admin/imports/*                         (SUPER_ADMIN)
 *   audit.ts          /admin/audit                             (SUPER_ADMIN)
 *
 * Each area module calls `baseApi.injectEndpoints`, so there is one cache, one
 * reducer and one middleware however many modules exist. Components use the
 * generated hooks and never build a URL, choose a method or touch fetch.
 *
 * Role gating shown in the interface is a convenience only; the backend
 * authorizes every one of these endpoints on its own.
 *
 * GET /api/health is intentionally absent: it is an operational readiness
 * probe for the container and proxy, not part of any product screen.
 */
export { baseApi, resetApiState, tagTypes } from "./baseApi";
export type { ApiFailure } from "./errors";
export { errorFields, errorMessage, errorRows } from "./errors";
export { searchParams } from "./searchParams";

export type { Credentials } from "./auth";
export { useLoginMutation, useLogoutMutation, useSessionQuery } from "./auth";

export type { RecordFilters, RecordPayload } from "./records";
export {
  useCreateRecordMutation,
  useDeleteRecordMutation,
  useExportRecordsMutation,
  useRecordQuery,
  useRecordsQuery,
  useRestoreRecordMutation,
  useSummaryQuery,
  useUpdateRecordMutation,
} from "./records";

export type { MunicipalityPayload } from "./municipalities";
export {
  useCreateMunicipalityMutation,
  useAreasQuery,
  useMunicipalitiesQuery,
  useMunicipalityOptionsQuery,
  useUpdateMunicipalityMutation,
} from "./municipalities";

export type { ImportRequest } from "./imports";
export {
  useConfirmImportMutation,
  useImportsQuery,
  usePreviewImportMutation,
} from "./imports";

export { useAuditQuery } from "./audit";
