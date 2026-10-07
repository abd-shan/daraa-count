import type { User } from "../types";
import { baseApi } from "./baseApi";
import type { ApiFailure } from "./errors";

export interface Credentials {
  username: string;
  password: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * GET /auth/me — resolves to null when there is no valid session.
     *
     * A 401 here is the expected signed-out answer rather than a failure, so
     * it becomes data and the shell renders the sign-in screen instead of an
     * error screen. Any other status still surfaces as an error.
     */
    session: build.query<User | null, void>({
      queryFn: async (_arg, _api, _extra, fetchWithBQ) => {
        const result = await fetchWithBQ("/auth/me");
        if (!result.error) return { data: result.data as User };
        const failure = result.error as ApiFailure;
        return failure.status === 401 ? { data: null } : { error: failure };
      },
      providesTags: ["Session"],
    }),
    /** POST /auth/login — public, rate limited. Returns the user, unwrapped. */
    login: build.mutation<User, Credentials>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
    }),
    /** POST /auth/logout — revokes the session server-side. */
    logout: build.mutation<unknown, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),
  }),
});

export const { useSessionQuery, useLoginMutation, useLogoutMutation } = authApi;
