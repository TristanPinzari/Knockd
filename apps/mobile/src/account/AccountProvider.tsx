/**
 * Auth0 login for the app (MOBILE.md "Login"): scope `openid profile email offline_access` and the
 * API audience, so the access token works with the API and the refresh token keeps people logged
 * in. Without the EXPO_PUBLIC_AUTH0_* settings the app runs guest-only.
 */
import { useEffect, type ReactNode } from "react";
import { Auth0Provider, useAuth0 } from "react-native-auth0";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import { useAccountStore } from "./accountStore";

const DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
const CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
const AUDIENCE = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
const SCOPE = "openid profile email offline_access";

/** Keeps the account store in step with Auth0, and loads your name and teams after login. */
function AccountSync() {
  const { user, isLoading, authorize, clearSession, getCredentials } = useAuth0();

  useEffect(() => {
    const getToken = async () => (await getCredentials()).accessToken;
    useAccountStore.getState().set({
      available: true,
      actions: {
        login: async () => {
          useAccountStore.getState().set({ error: null });
          await authorize({ audience: AUDIENCE, scope: SCOPE });
        },
        logout: async () => {
          await clearSession();
          useAccountStore.getState().set({ loggedIn: false, me: null });
        },
        getToken,
      },
    });
  }, [authorize, clearSession, getCredentials]);

  useEffect(() => {
    useAccountStore.getState().set({ restoring: isLoading });
  }, [isLoading]);

  const sub = user?.sub ?? null;
  useEffect(() => {
    if (!sub) {
      useAccountStore.getState().set({ loggedIn: false, me: null });
      return undefined;
    }
    useAccountStore.getState().set({ loggedIn: true });
    let cancelled = false;
    void (async () => {
      try {
        const token = (await getCredentials()).accessToken;
        const me = await (await getRuntime()).api.getMe(token);
        if (!cancelled) useAccountStore.getState().set({ me, error: null });
      } catch (error) {
        logger.warn("account: could not load your teams", error);
        if (!cancelled) useAccountStore.getState().set({ error: "Couldn't load your teams. Check your signal." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sub, getCredentials]);

  return null;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  if (!DOMAIN || !CLIENT_ID || !AUDIENCE) return <>{children}</>;
  return (
    <Auth0Provider domain={DOMAIN} clientId={CLIENT_ID}>
      <AccountSync />
      {children}
    </Auth0Provider>
  );
}
