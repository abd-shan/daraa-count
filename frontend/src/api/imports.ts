import type {
  Category,
  ImportBatch,
  ImportPreview,
  ImportResult,
  Page,
} from "../types";
import { baseApi } from "./baseApi";
import { searchParams } from "./searchParams";

export interface ImportRequest {
  municipalityId: string;
  category: Category;
  file: File | null;
}

/**
 * Both import endpoints take the same multipart body. The file itself is sent
 * again on confirmation: the backend re-parses and re-validates the original
 * upload rather than trusting anything the browser saw during the preview.
 *
 * No Content-Type is set here — the browser must generate the boundary.
 */
function multipart(input: ImportRequest): FormData {
  const form = new FormData();
  form.set("municipalityId", input.municipalityId);
  form.set("category", input.category);
  if (input.file) form.set("file", input.file);
  return form;
}

export const importsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * POST /admin/imports/preview — validates only; writes no records. It is
     * a mutation because it uploads a file, not because it changes state.
     */
    previewImport: build.mutation<ImportPreview, ImportRequest>({
      query: (input) => ({
        url: "/admin/imports/preview",
        method: "POST",
        body: multipart(input),
      }),
    }),
    /** POST /admin/imports/confirm — re-validates, then imports atomically. */
    confirmImport: build.mutation<ImportResult, ImportRequest>({
      query: (input) => ({
        url: "/admin/imports/confirm",
        method: "POST",
        body: multipart(input),
      }),
      invalidatesTags: ["Import", "Record", "Summary", "Municipality"],
    }),
    /** GET /admin/imports — the import batch history. */
    imports: build.query<Page<ImportBatch>, number>({
      query: (page) => "/admin/imports?" + searchParams({ page }),
      providesTags: ["Import"],
    }),
  }),
});

export const {
  usePreviewImportMutation,
  useConfirmImportMutation,
  useImportsQuery,
} = importsApi;
