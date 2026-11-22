import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router-dom";
import { App } from "./App";
import { config, missingConfig } from "./config";
import "./styles.css";
import { ErrorBoundary } from "./ui";

/** Auth0 inside the router, so after login it can send people back where they were (e.g. an invite link). */
function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <Auth0Provider
      domain={config.auth0.domain}
      clientId={config.auth0.clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience: config.auth0.audience }}
      // Refresh tokens in local storage keep people signed in across reloads, even when the
      // browser blocks third-party cookies (which silent sign-in would otherwise need).
      useRefreshTokens
      cacheLocation="localstorage"
      onRedirectCallback={(state?: AppState) => navigate(state?.returnTo ?? "/", { replace: true })}
    >
      {children}
    </Auth0Provider>
  );
}

/** Shown instead of the app when .env isn't filled in (local dev), rather than a blank page. */
function SetupNeeded() {
  return (
    <div className="page">
      <div className="container">
        <h2 style={{ margin: "32px 0 8px" }}>Almost there</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          These settings are missing from <code>apps/web/.env</code> (see <code>.env.example</code> and docs/WEB.md):
        </p>
        <ul>
          {missingConfig.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="muted">Then restart the dev server: Vite only reads .env when it starts.</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {missingConfig.length ? (
      <SetupNeeded />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);
