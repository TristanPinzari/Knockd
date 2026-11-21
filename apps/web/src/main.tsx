import { Auth0Provider } from "@auth0/auth0-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { config } from "./config";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Auth0Provider
      domain={config.auth0.domain}
      clientId={config.auth0.clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience: config.auth0.audience }}
      // Refresh tokens in local storage keep people signed in across reloads, even when the
      // browser blocks third-party cookies (which silent sign-in would otherwise need).
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
);
