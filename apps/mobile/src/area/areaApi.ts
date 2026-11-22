/**
 * Typed calls for the session area endpoints in docs/API.md: area (streets/blocks/houses by cell),
 * layers (past team data), plan and stats. Responses are validated with the shared zod schemas.
 *
 * TODO(offline): cache area responses on device (README requires offline use of loaded cells).
 */
import { z } from "zod";
import {
  GetSessionPlanRes,
  Session,
  SessionAreaRes,
  SessionLayersRes,
  SessionStatsRes,
  type CellId,
} from "@knockd/shared";
import { createGetJson, type HttpOptions } from "./http";

/** docs/API.md: up to 25 cells per area/layers request. */
export const MAX_CELLS_PER_REQUEST = 25;

/** Only the session part of the snapshot (zod strips the rest): we need the planned area. */
const SessionInfoRes = z.object({ session: Session });

export type SessionInfo = z.infer<typeof Session>;

export interface AreaApi {
  getSessionInfo(sessionId: string, token: string): Promise<SessionInfo>;
  getArea(sessionId: string, token: string, cells: readonly CellId[]): Promise<SessionAreaRes>;
  getLayers(sessionId: string, token: string, cells: readonly CellId[]): Promise<SessionLayersRes>;
  getPlan(sessionId: string, token: string): Promise<GetSessionPlanRes>;
  getStats(sessionId: string, token: string): Promise<SessionStatsRes>;
}

/** Splits cell ids into request-sized chunks. */
export function chunkCells(cells: readonly CellId[], size: number = MAX_CELLS_PER_REQUEST): CellId[][] {
  const chunks: CellId[][] = [];
  for (let i = 0; i < cells.length; i += size) chunks.push(cells.slice(i, i + size));
  return chunks;
}

function cellsQuery(cells: readonly CellId[]): { cells: string } {
  if (cells.length === 0 || cells.length > MAX_CELLS_PER_REQUEST) {
    throw new RangeError(`Expected 1 to ${MAX_CELLS_PER_REQUEST} cells, got ${cells.length}`);
  }
  return { cells: cells.join(",") };
}

export function createAreaApi(options: HttpOptions): AreaApi {
  const getJson = createGetJson(options);
  const base = (sessionId: string): string => `/v1/sessions/${encodeURIComponent(sessionId)}`;

  return {
    getSessionInfo: async (sessionId, token) =>
      (await getJson({ path: base(sessionId), token, schema: SessionInfoRes })).session,
    getArea: async (sessionId, token, cells) =>
      getJson({ path: `${base(sessionId)}/area`, token, query: cellsQuery(cells), schema: SessionAreaRes }),
    getLayers: async (sessionId, token, cells) =>
      getJson({ path: `${base(sessionId)}/layers`, token, query: cellsQuery(cells), schema: SessionLayersRes }),
    getPlan: (sessionId, token) => getJson({ path: `${base(sessionId)}/plan`, token, schema: GetSessionPlanRes }),
    getStats: (sessionId, token) => getJson({ path: `${base(sessionId)}/stats`, token, schema: SessionStatsRes }),
  };
}
