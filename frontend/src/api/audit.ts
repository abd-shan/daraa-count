import type { AuditEntry, Page } from "../types";
import { baseApi } from "./baseApi";
import { searchParams } from "./searchParams";

export const auditApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * GET /admin/audit — action history. The backend records actors, actions
     * and changed field names, never whole personal records or credentials.
     * An empty action is dropped, so no filter is sent.
     */
    audit: build.query<Page<AuditEntry>, { page: number; action: string }>({
      query: (args) => "/admin/audit?" + searchParams({ ...args }),
      providesTags: ["Audit"],
    }),
  }),
});

export const { useAuditQuery } = auditApi;
