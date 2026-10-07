import { configureStore, isRejectedWithValue } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import type { Middleware } from "@reduxjs/toolkit";
import { useDispatch } from "react-redux";
import { baseApi } from "./api";
import type { ApiFailure } from "./api";
import { authApi } from "./api/auth";
import { clearAllDrafts } from "./drafts";

/**
 * Drops the whole API cache the first time a request comes back 401, so an
 * expired or revoked session cannot leave another user's data on screen.
 *
 * A session check turns 401 into null, so handle that fulfilled answer too.
 * Reset only when the cache previously held a user to avoid a refetch loop.
 * Always clear drafts on a signed-out answer, including after a page reload.
 */
const sessionGuard: Middleware = (api) => (next) => (action) => {
  const rejectedSession =
    isRejectedWithValue(action) &&
    (action.payload as ApiFailure | undefined)?.status === 401;
  const signedOutSession =
    authApi.endpoints.session.matchFulfilled(action) && action.payload === null;
  if (rejectedSession || signedOutSession) {
    const state = api.getState() as RootState;
    const hadSession = !!authApi.endpoints.session.select()(state).data;
    const result = next(action);
    clearAllDrafts();
    if (hadSession) api.dispatch(baseApi.util.resetApiState());
    return result;
  }
  return next(action);
};

/**
 * The store holds the API cache and nothing else. This application has no
 * client-side domain state worth keeping in Redux: the server is the single
 * source of truth, and screen-local state (form values, which dialog is open,
 * the current page) belongs to the component that owns it.
 *
 * Add a slice here only when state must genuinely be shared between unrelated
 * screens and cannot come from the server.
 */
export const createStore = () =>
  configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) =>
      getDefault().concat(baseApi.middleware, sessionGuard),
  });

/** The application store. Tests build their own so caches stay isolated. */
export const store = createStore();

// Enables refetchOnFocus / refetchOnReconnect declared on the base API.
setupListeners(store.dispatch);

export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore["dispatch"];
export type RootState = ReturnType<AppStore["getState"]>;

/** Typed dispatch, so a cache reset is not loosely typed at the call site. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
