import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { MapView } from "../MapView";
import { ThemeToggle, Logo } from "../ui";

/** Auth0 adds these to the address when it sends you back; they're single-use. */
const AUTH_PARAMS = ["code", "state", "error", "error_description"];

/** Signed-out: the map in the background and one card. After login, back to the page they opened (e.g. an invite). */
export function Landing() {
  const { loginWithRedirect, error } = useAuth0();
  const login = (signup: boolean) =>
    loginWithRedirect({
      appState: { returnTo: window.location.pathname },
      authorizationParams: signup ? { screen_hint: "signup" } : {},
    });

  // After a failed sign-in, drop Auth0's leftover parameters so a reload doesn't try to finish it again.
  useEffect(() => {
    if (!error) return;
    const url = new URL(window.location.href);
    if (!AUTH_PARAMS.some((p) => url.searchParams.has(p))) return;
    AUTH_PARAMS.forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [error]);

  // "Invalid state" means a stale sign-in address was reopened (reload or back); logging in again fixes it.
  const shown = error && !/invalid state/i.test(error.message) ? error.message : null;

  return (
    <div className="map-screen">
      <MapView interactive={false} />
      <div className="float-top-right">
        <ThemeToggle />
      </div>
      <div className="card" style={{ position: "absolute", left: 24, bottom: 24, maxWidth: 460, padding: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <Logo />
        </div>
        <h1>See every door your team has knocked.</h1>
        <p className="muted" style={{ margin: "14px 0 24px", fontSize: 17, lineHeight: 1.45 }}>
          Your team&apos;s map builds itself from every session: where you&apos;ve been, how long ago, and which blocks
          turn into leads.
        </p>
        {shown && <p style={{ color: "var(--bad)", marginBottom: 12 }}>Sign-in didn&apos;t work: {shown}</p>}
        <div className="row">
          <button className="btn btn-primary" onClick={() => login(false)}>
            Log in
          </button>
          <button className="btn btn-secondary" onClick={() => login(true)}>
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
}
