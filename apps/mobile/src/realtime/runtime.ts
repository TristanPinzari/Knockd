/**
 * Default wiring of the real (native) pieces: fetch API client, SQLite outbox, flusher.
 * Created lazily because the background location task can start the JS runtime headless. Not unit
 * tested (it only glues native modules); the parts it wires are.
 */
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { createApiClient, type ApiClient } from "./api";
import { getApiUrl } from "./config";
import { createFlusher, type OutboxFlusher } from "./outbox/flusher";
import { createOutbox, type Outbox } from "./outbox/outbox";
import { createSqliteOutboxStore, type SqlDb } from "./outbox/sqliteStore";

export interface Runtime {
  api: ApiClient;
  outbox: Outbox;
  flusher: OutboxFlusher;
}

const DB_NAME = "knockd-outbox.db";
let runtime: Promise<Runtime> | null = null;

export function getRuntime(): Promise<Runtime> {
  runtime ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    const store = await createSqliteOutboxStore(db as unknown as SqlDb);
    const api = createApiClient({ baseUrl: getApiUrl() });
    const newId = (): string => Crypto.randomUUID();
    return {
      api,
      outbox: createOutbox({ store, newId, now: Date.now }),
      flusher: createFlusher({ store, api, now: Date.now }),
    };
  })().catch((error: unknown) => {
    runtime = null; // let the next call retry opening the database
    throw error;
  });
  return runtime;
}
