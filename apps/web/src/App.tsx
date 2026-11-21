import { useAuth0 } from "@auth0/auth0-react";
import type { GetMeRes } from "@knockd/shared";
import { useEffect, useState } from "react";
import { useApi } from "./api";
import { MapView } from "./MapView";

/**
 * Skeleton only: sign in, see your teams, and the basemap. The real screens (team dashboard,
 * team map, session replay, highlights and notes) replace this once the design is agreed.
 */
export function App() {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, error } = useAuth0();
  const api = useApi();
  const [me, setMe] = useState<GetMeRes | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    api<GetMeRes>("/v1/me")
      .then(setMe)
      .catch((err: Error) => setApiError(err.message));
  }, [isAuthenticated, api]);

  return (
    <>
      <MapView />
      <div style={{ position: "absolute", top: 12, left: 12, background: "white", padding: 12, borderRadius: 8 }}>
        <strong>Knockd</strong>
        {isLoading && <p>Loading…</p>}
        {error && <p>Sign-in failed: {error.message}</p>}
        {!isLoading && !isAuthenticated && <button onClick={() => loginWithRedirect()}>Log in</button>}
        {isAuthenticated && (
          <>
            {me && (
              <>
                <p>Signed in as {me.user.displayName}</p>
                <p>Teams: {me.teams.length ? me.teams.map((t) => `${t.name} (${t.role})`).join(", ") : "none yet"}</p>
              </>
            )}
            {apiError && <p>API error: {apiError}</p>}
            <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Log out</button>
          </>
        )}
      </div>
    </>
  );
}
