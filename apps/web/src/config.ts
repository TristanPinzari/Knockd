/** Build-time settings from .env (see .env.example). Vite inlines them, so none are secret. */
const env = {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_AUTH0_DOMAIN: import.meta.env.VITE_AUTH0_DOMAIN,
  VITE_AUTH0_CLIENT_ID: import.meta.env.VITE_AUTH0_CLIENT_ID,
  VITE_AUTH0_AUDIENCE: import.meta.env.VITE_AUTH0_AUDIENCE,
};

/** Settings that are empty or missing (the app shows a setup message instead of starting). */
export const missingConfig = Object.entries(env)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const config = {
  apiUrl: env.VITE_API_URL ?? "",
  auth0: {
    domain: env.VITE_AUTH0_DOMAIN ?? "",
    clientId: env.VITE_AUTH0_CLIENT_ID ?? "",
    audience: env.VITE_AUTH0_AUDIENCE ?? "",
  },
};
