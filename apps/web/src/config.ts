/** Build-time settings from .env (see .env.example). Vite inlines them, so none are secret. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}: copy apps/web/.env.example to apps/web/.env and fill it in`);
  return value;
}

export const config = {
  apiUrl: required("VITE_API_URL", import.meta.env.VITE_API_URL),
  auth0: {
    domain: required("VITE_AUTH0_DOMAIN", import.meta.env.VITE_AUTH0_DOMAIN),
    clientId: required("VITE_AUTH0_CLIENT_ID", import.meta.env.VITE_AUTH0_CLIENT_ID),
    audience: required("VITE_AUTH0_AUDIENCE", import.meta.env.VITE_AUTH0_AUDIENCE),
  },
};
