import type {
  Category,
  CensusRecord,
  MaritalStatus,
  Page,
  Summary,
} from "../types";
import { API_URL } from "../config";
import { baseApi } from "./baseApi";
import { searchParams } from "./searchParams";
import { toApiFailure } from "./errors";

/** The record list page size used throughout the interface. */
export const PAGE_SIZE = 25;

export interface RecordFilters {
  category: Category;
  page: number;
  search: string;
  deleted: boolean;
  maritalStatus?: MaritalStatus;
  /**
   * Administrator-only filter. A municipality interface leaves this
   * undefined; the backend derives the municipality from the session and
   * ignores anything a municipality user sends.
   */
  municipalityId?: string;
}

/** The writable fields of a census record. Identifiers stay strings. */
export interface RecordPayload {
  category: Category;
  personName: string;
  maritalStatus: MaritalStatus | null;
  spouseName: string | null;
  nationalId: string;
  familyBookNumber: string;
  familyMembersCount: number | null;
  /** Administrator-only; set on create when choosing the target municipality. */
  municipalityId?: string;
  phone: string;
  notes: string;
}

const recordQuery = (filters: RecordFilters) =>
  searchParams({
    category: filters.category,
    page: filters.page,
    pageSize: PAGE_SIZE,
    search: filters.search,
    deleted: filters.deleted,
    maritalStatus: filters.maritalStatus,
    municipalityId: filters.municipalityId,
  });

export const recordsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /records/summary — counts per category, scoped to the session. */
    summary: build.query<Summary, void>({
      query: () => "/records/summary",
      providesTags: ["Summary"],
    }),
    /** GET /records */
    records: build.query<Page<CensusRecord>, RecordFilters>({
      query: (filters) => "/records?" + recordQuery(filters),
      providesTags: ["Record"],
    }),
    /**
     * GET /records/:id — available for a future detail route. The current
     * editor opens from the row already held by the list query.
     */
    record: build.query<CensusRecord, string>({
      query: (id) => "/records/" + id,
      providesTags: ["Record"],
    }),
    /** POST /records */
    createRecord: build.mutation<CensusRecord, RecordPayload>({
      query: (body) => ({ url: "/records", method: "POST", body }),
      invalidatesTags: ["Record", "Summary", "Municipality"],
    }),
    /**
     * PATCH /records/:id — the body is the complete validated form, not an
     * arbitrary partial patch. `expectedUpdatedAt` rejects a stale edit.
     */
    updateRecord: build.mutation<
      CensusRecord,
      { id: string; expectedUpdatedAt: string; body: RecordPayload }
    >({
      query: ({ id, expectedUpdatedAt, body }) => ({
        url: "/records/" + id,
        method: "PATCH",
        body: { ...body, expectedUpdatedAt },
      }),
      invalidatesTags: ["Record", "Summary"],
    }),
    /** DELETE /records/:id — soft delete; sets deletedAt. */
    deleteRecord: build.mutation<unknown, string>({
      query: (id) => ({ url: "/records/" + id, method: "DELETE" }),
      invalidatesTags: ["Record", "Summary", "Municipality"],
    }),
    /** POST /records/:id/restore — SUPER_ADMIN only. */
    restoreRecord: build.mutation<unknown, string>({
      query: (id) => ({ url: "/records/" + id + "/restore", method: "POST" }),
      invalidatesTags: ["Record", "Summary", "Municipality"],
    }),
    /**
     * GET /records/export/xlsx — a binary download rather than cached state,
     * so it runs through a queryFn: it needs the response headers for the
     * Arabic filename and hands the blob straight to the browser. Modelled as
     * a mutation so the button gets the usual pending state, and because it
     * writes an audit entry server-side.
     */
    exportRecords: build.mutation<null, RecordFilters>({
      queryFn: async (filters) => {
        const url = API_URL + "/records/export/xlsx?" + recordQuery(filters);
        let response: Response;
        try {
          response = await fetch(url, { credentials: "same-origin" });
        } catch {
          return { error: toApiFailure(0, {}) };
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          return { error: toApiFailure(response.status, body) };
        }
        saveBlob(
          await response.blob(),
          response.headers.get("Content-Disposition") ?? "",
        );
        return { data: null };
      },
    }),
  }),
});

/** Hands a downloaded blob to the browser, preferring the server's filename. */
function saveBlob(blob: Blob, disposition: string) {
  const objectUrl = URL.createObjectURL(blob);
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = match ? decodeURIComponent(match[1]) : "count-daraa.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export const {
  useSummaryQuery,
  useRecordsQuery,
  useRecordQuery,
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useRestoreRecordMutation,
  useExportRecordsMutation,
} = recordsApi;
