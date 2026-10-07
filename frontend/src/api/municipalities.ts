import type { Municipality, MunicipalityOption, Page } from "../types";
import { baseApi } from "./baseApi";
import { searchParams } from "./searchParams";

export interface MunicipalityPayload {
  name: string;
  areaName: string;
}

export interface AccountPayload {
  username: string;
  password: string;
}

export const municipalitiesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** GET /admin/municipalities — full records with accounts and counts. */
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
    /** POST /admin/municipalities — creates the municipality and first account. */
    createMunicipality: build.mutation<
      Municipality,
      MunicipalityPayload & AccountPayload
    >({
      query: (body) => ({ url: "/admin/municipalities", method: "POST", body }),
      invalidatesTags: ["Municipality", "MunicipalityOption", "Summary"],
    }),
    /** PATCH /admin/municipalities/:id — rename, or enable/disable. */
    updateMunicipality: build.mutation<
      Municipality,
      { id: string; body: MunicipalityPayload | { isActive: boolean } }
    >({
      query: ({ id, body }) => ({
        url: "/admin/municipalities/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Municipality", "MunicipalityOption", "Summary"],
    }),
    /** POST /admin/municipalities/:id/users — adds another committee account. */
    createAccount: build.mutation<
      unknown,
      { municipalityId: string; body: AccountPayload }
    >({
      query: ({ municipalityId, body }) => ({
        url: "/admin/municipalities/" + municipalityId + "/users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Municipality"],
    }),
    /**
     * PATCH /admin/users/:id — resets the password or changes the account
     * status. Both revoke the account's current sessions. An existing password
     * is never returned by any endpoint and is never displayed.
     */
    updateAccount: build.mutation<
      unknown,
      { id: string; body: { password: string } | { isActive: boolean } }
    >({
      query: ({ id, body }) => ({
        url: "/admin/users/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Municipality"],
    }),
  }),
});

export const {
  useMunicipalitiesQuery,
  useMunicipalityOptionsQuery,
  useCreateMunicipalityMutation,
  useUpdateMunicipalityMutation,
  useCreateAccountMutation,
  useUpdateAccountMutation,
} = municipalitiesApi;
