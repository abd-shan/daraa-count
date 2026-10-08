import type { Municipality, MunicipalityOption, Page } from "../types";
import { baseApi } from "./baseApi";
import { searchParams } from "./searchParams";

export interface MunicipalityPayload {
  name: string;
  areaName: string;
}

export const municipalitiesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /admin/municipalities — municipalities with record counts. */
    municipalities: build.query<
      Page<Municipality>,
      { page: number; search: string }
    >({
      query: (args) => "/admin/municipalities?" + searchParams({ ...args }),
      providesTags: ["Municipality"],
    }),
    /** GET /admin/municipalities/options — the lightweight selector lookup. */
    municipalityOptions: build.query<MunicipalityOption[], void>({
      query: () => "/admin/municipalities/options",
      providesTags: ["MunicipalityOption"],
    }),
    areas: build.query<string[], void>({
      query: () => "/admin/areas",
      providesTags: ["Area"],
    }),
    /** POST /admin/municipalities — creates only the municipality. */
    createMunicipality: build.mutation<MunicipalityOption, MunicipalityPayload>({
      query: (body) => ({ url: "/admin/municipalities", method: "POST", body }),
      invalidatesTags: [
        "Municipality",
        "MunicipalityOption",
        "Area",
        "Summary",
      ],
    }),
    /** PATCH /admin/municipalities/:id — rename, or enable/disable. */
    updateMunicipality: build.mutation<
      MunicipalityOption,
      { id: string; body: MunicipalityPayload | { isActive: boolean } }
    >({
      query: ({ id, body }) => ({
        url: "/admin/municipalities/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        "Municipality",
        "MunicipalityOption",
        "Area",
        "Summary",
      ],
    }),
  }),
});

export const {
  useMunicipalitiesQuery,
  useMunicipalityOptionsQuery,
  useCreateMunicipalityMutation,
  useUpdateMunicipalityMutation,
  useAreasQuery,
} = municipalitiesApi;
