/**
 * Thin typed client for the in-session REST endpoints in docs/API.md. Every call takes the session
 * token (not the Auth0 account token). Responses are validated with the shared zod schemas.
 */
import type { z } from "zod";
import {
  ApiError,
  CreateSessionRes,
  GetMessagesRes,
  JoinSessionRes,
  PostLeadRes,
  PostMessageRes,
  PostPingsRes,
  PostPinRes,
  SessionSnapshotRes,
  StartSimRes,
  TrailsRes,
  type CreateSessionBody,
  type CreateSessionRes as CreateSessionResT,
  type JoinSessionBody,
  type JoinSessionRes as JoinSessionResT,
  type SimPace,
  type StartSimRes as StartSimResT,
  type GetMessagesRes as GetMessagesResT,
  type PatchLeadBody,
  type Ping,
  type PostLeadBody,
  type PostLeadRes as PostLeadResT,
  type PostMessageBody,
  type PostMessageRes as PostMessageResT,
  type PostPingsRes as PostPingsResT,
  type PostPinBody,
  type PostPinRes as PostPinResT,
  type SessionSnapshotRes as SessionSnapshotResT,
  type TrailsRes as TrailsResT,
} from "@knockd/shared";
import { ApiRequestError, NetworkError, ResponseShapeError } from "./errors";

export const REQUEST_TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

interface RequestOptions<S extends z.ZodTypeAny | null> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** Null for the unauthenticated guest endpoints (create / join without an account). */
  token: string | null;
  query?: Record<string, string | undefined>;
  body?: unknown;
  schema: S;
}

export interface ApiClient {
  getSnapshot(sessionId: string, token: string): Promise<SessionSnapshotResT>;
  /** `sinceMs`: only points newer than this (ms since epoch). Omit for the whole session. */
  getTrails(sessionId: string, token: string, sinceMs?: number | null): Promise<TrailsResT>;
  getMessages(sessionId: string, token: string, afterMessageId?: string): Promise<GetMessagesResT>;
  postPings(sessionId: string, token: string, pings: Ping[]): Promise<PostPingsResT>;
  postLead(sessionId: string, token: string, body: PostLeadBody): Promise<PostLeadResT>;
  patchLead(sessionId: string, token: string, leadClientId: string, body: PatchLeadBody): Promise<PostLeadResT>;
  deleteLead(sessionId: string, token: string, leadClientId: string): Promise<void>;
  postPin(sessionId: string, token: string, body: PostPinBody): Promise<PostPinResT>;
  deletePin(sessionId: string, token: string, pinClientId: string): Promise<void>;
  postMessage(sessionId: string, token: string, body: PostMessageBody): Promise<PostMessageResT>;
  /** `accountToken`: optional Auth0 token to link the session to an account. Omit for guests. */
  createSession(body: CreateSessionBody, accountToken?: string | null): Promise<CreateSessionResT>;
  joinSession(body: JoinSessionBody, accountToken?: string | null): Promise<JoinSessionResT>;
  /** Admin only. */
  endSession(sessionId: string, token: string): Promise<void>;
  leaveSession(sessionId: string, token: string): Promise<void>;
  /** Admin only. Starts `bots` simulated crew members (1 to 7). */
  startSim(sessionId: string, token: string, bots: number, pace: SimPace): Promise<StartSimResT>;
  stopSim(sessionId: string, token: string): Promise<void>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function send(req: RequestOptions<z.ZodTypeAny | null>): Promise<Response> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query ?? {})) if (value !== undefined) search.set(key, value);
    const qs = search.toString();
    const url = `${baseUrl}${req.path}${qs ? `?${qs}` : ""}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(url, {
        method: req.method,
        signal: controller.signal,
        headers: {
          ...(req.token ? { Authorization: `Bearer ${req.token}` } : {}),
          Accept: "application/json",
          ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });
    } catch (cause) {
      throw new NetworkError(controller.signal.aborted ? "Request timed out" : "Network request failed", { cause });
    } finally {
      clearTimeout(timer);
    }
  }

  async function toApiError(res: Response): Promise<ApiRequestError> {
    try {
      const parsed = ApiError.safeParse(await res.json());
      if (parsed.success) return new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message);
    } catch {
      // fall through: body was empty or not JSON
    }
    return new ApiRequestError(res.status, null, `Request failed with status ${res.status}`);
  }

  async function request<S extends z.ZodTypeAny>(req: RequestOptions<S>): Promise<z.infer<S>>;
  async function request(req: RequestOptions<null>): Promise<void>;
  async function request(req: RequestOptions<z.ZodTypeAny | null>): Promise<unknown> {
    const res = await send(req);
    if (!res.ok) throw await toApiError(res);
    if (req.schema === null) return undefined;
    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new ResponseShapeError(req.path, `body is not JSON (${String(cause)})`);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new ResponseShapeError(req.path, parsed.error.issues[0]?.message ?? "invalid body");
    return parsed.data;
  }

  const base = (sessionId: string) => `/v1/sessions/${encodeURIComponent(sessionId)}`;
  const leadPath = (sessionId: string, id: string) => `${base(sessionId)}/leads/${encodeURIComponent(id)}`;
  const pinPath = (sessionId: string, id: string) => `${base(sessionId)}/pins/${encodeURIComponent(id)}`;

  return {
    getSnapshot: (sessionId, token) =>
      request({ method: "GET", path: base(sessionId), token, schema: SessionSnapshotRes }),
    getTrails: (sessionId, token, sinceMs) =>
      request({
        method: "GET",
        path: `${base(sessionId)}/trails`,
        token,
        query: { since: sinceMs == null ? undefined : new Date(sinceMs).toISOString() },
        schema: TrailsRes,
      }),
    getMessages: (sessionId, token, after) =>
      request({
        method: "GET",
        path: `${base(sessionId)}/messages`,
        token,
        query: { after },
        schema: GetMessagesRes,
      }),
    postPings: (sessionId, token, pings) =>
      request({ method: "POST", path: `${base(sessionId)}/pings`, token, body: { pings }, schema: PostPingsRes }),
    postLead: (sessionId, token, body) =>
      request({ method: "POST", path: `${base(sessionId)}/leads`, token, body, schema: PostLeadRes }),
    patchLead: (sessionId, token, id, body) =>
      request({ method: "PATCH", path: leadPath(sessionId, id), token, body, schema: PostLeadRes }),
    deleteLead: (sessionId, token, id) =>
      request({ method: "DELETE", path: leadPath(sessionId, id), token, schema: null }),
    postPin: (sessionId, token, body) =>
      request({ method: "POST", path: `${base(sessionId)}/pins`, token, body, schema: PostPinRes }),
    deletePin: (sessionId, token, id) =>
      request({ method: "DELETE", path: pinPath(sessionId, id), token, schema: null }),
    postMessage: (sessionId, token, body) =>
      request({ method: "POST", path: `${base(sessionId)}/messages`, token, body, schema: PostMessageRes }),
    createSession: (body, accountToken) =>
      request({ method: "POST", path: "/v1/sessions", token: accountToken ?? null, body, schema: CreateSessionRes }),
    joinSession: (body, accountToken) =>
      request({ method: "POST", path: "/v1/sessions/join", token: accountToken ?? null, body, schema: JoinSessionRes }),
    endSession: (sessionId, token) => request({ method: "POST", path: `${base(sessionId)}/end`, token, schema: null }),
    leaveSession: (sessionId, token) =>
      request({ method: "POST", path: `${base(sessionId)}/leave`, token, schema: null }),
    startSim: (sessionId, token, bots, pace) =>
      request({ method: "POST", path: `${base(sessionId)}/sim`, token, body: { bots, pace }, schema: StartSimRes }),
    stopSim: (sessionId, token) => request({ method: "DELETE", path: `${base(sessionId)}/sim`, token, schema: null }),
  };
}
