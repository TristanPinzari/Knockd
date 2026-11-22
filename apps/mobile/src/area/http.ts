/**
 * Minimal GET + zod validation for the area endpoints. Mirrors the error behaviour of
 * src/realtime/api.ts (same error classes) without touching that file, which another module owns.
 */
import type { z } from "zod";
import { ApiError } from "@knockd/shared";
import { ApiRequestError, NetworkError, ResponseShapeError } from "../realtime/errors";

export const AREA_REQUEST_TIMEOUT_MS = 20_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

export interface GetRequest<S extends z.ZodTypeAny> {
  readonly path: string;
  readonly token: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly schema: S;
}

export type GetJson = <S extends z.ZodTypeAny>(req: GetRequest<S>) => Promise<z.infer<S>>;

async function toApiError(res: Response): Promise<ApiRequestError> {
  try {
    const parsed = ApiError.safeParse(await res.json());
    if (parsed.success) return new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message);
  } catch {
    // body was empty or not JSON: fall through to a generic error
  }
  return new ApiRequestError(res.status, null, `Request failed with status ${res.status}`);
}

function buildUrl(baseUrl: string, path: string, query: Readonly<Record<string, string>> | undefined): string {
  const qs = new URLSearchParams(query ?? {}).toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
}

export function createGetJson(options: HttpOptions): GetJson {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? AREA_REQUEST_TIMEOUT_MS;

  async function send(url: string, token: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // React Native's fetch negotiates gzip itself; the header just makes it explicit (docs/API.md).
      return await doFetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Encoding": "gzip" },
      });
    } catch (cause) {
      throw new NetworkError(controller.signal.aborted ? "Request timed out" : "Network request failed", { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  return async (req) => {
    const res = await send(buildUrl(baseUrl, req.path, req.query), req.token);
    if (!res.ok) throw await toApiError(res);
    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new ResponseShapeError(req.path, `body is not JSON (${String(cause)})`);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new ResponseShapeError(req.path, parsed.error.issues[0]?.message ?? "invalid body");
    return parsed.data;
  };
}
