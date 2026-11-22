/**
 * The logged-in account (Auth0), for the parts that need one: linking sessions to the account,
 * loading a team map into a session, and adding a finished session to a team. Joining and
 * creating sessions never need it.
 *
 * Screens read this store. AccountSync (inside Auth0's provider) fills it and registers the login,
 * logout and token functions, so nothing outside it touches Auth0 directly.
 */
import { create } from "zustand";
import type { GetMeRes } from "@knockd/shared";

export interface AccountActions {
  login(): Promise<void>;
  logout(): Promise<void>;
  /** A fresh access token for the API (refreshed when needed), or null when logged out. */
  getToken(): Promise<string | null>;
}

export interface AccountState {
  /** False when the app has no Auth0 settings: guests only. */
  readonly available: boolean;
  /** True while a stored login is being restored at startup. */
  readonly restoring: boolean;
  /** From GET /v1/me: your name and teams. Null when logged out (or not loaded yet). */
  readonly me: GetMeRes | null;
  readonly loggedIn: boolean;
  readonly error: string | null;
  readonly actions: AccountActions | null;
  set(patch: Partial<Omit<AccountState, "set">>): void;
}

export const useAccountStore = create<AccountState>()((set) => ({
  available: false,
  restoring: false,
  me: null,
  loggedIn: false,
  error: null,
  actions: null,
  set: (patch) => set(patch),
}));

/** The account token, or null (logged out, Auth0 not set up, or it couldn't be refreshed). */
export async function getAccountToken(): Promise<string | null> {
  const actions = useAccountStore.getState().actions;
  if (!actions || !useAccountStore.getState().loggedIn) return null;
  try {
    return await actions.getToken();
  } catch {
    return null;
  }
}
