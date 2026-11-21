import { useAuth0 } from "@auth0/auth0-react";
import { useCallback } from "react";
import { config } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls the Knockd API with the signed-in user's account token. Response types come from
 * @knockd/shared, e.g. `const me = await api<GetMeRes>("/v1/me")`.
 */
export function useApi() {
  const { getAccessTokenSilently } = useAuth0();
  return useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getAccessTokenSilently();
      const res = await fetch(`${config.apiUrl}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : null;
      if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? "error", body?.error?.message ?? res.statusText);
      return body as T;
    },
    [getAccessTokenSilently],
  );
}
