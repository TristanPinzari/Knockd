import type { ServerToClientEvents } from "@knockd/shared";

/** The slice of a socket.io-client Socket we use, so tests can pass a fake. */
export interface SocketLike {
  on(event: "connect", handler: () => void): unknown;
  on(event: "disconnect", handler: (reason: string) => void): unknown;
  on(event: "connect_error", handler: (error: Error) => void): unknown;
  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): unknown;
  disconnect(): unknown;
}

export interface ConnectionHandlers {
  /** `isReconnect` is false for the first connect of this socket, true afterwards. */
  onConnect: (isReconnect: boolean) => void;
  onDisconnect: (reason: string) => void;
  onConnectError: (error: Error) => void;
}

/** Event names in one place so a new server event is a compile error until it is handled. */
const SERVER_EVENTS: { [E in keyof ServerToClientEvents]: true } = {
  "member:joined": true,
  "member:left": true,
  "member:status": true,
  positions: true,
  "lead:new": true,
  "lead:updated": true,
  "lead:removed": true,
  "pin:new": true,
  "pin:removed": true,
  "message:new": true,
  "plan:updated": true,
  "session:ended": true,
  "session:processed": true,
};

/** Attaches typed handlers for every server event plus connection lifecycle. */
export function bindSocket(socket: SocketLike, events: ServerToClientEvents, connection: ConnectionHandlers): void {
  let connectedBefore = false;
  socket.on("connect", () => {
    const isReconnect = connectedBefore;
    connectedBefore = true;
    connection.onConnect(isReconnect);
  });
  socket.on("disconnect", connection.onDisconnect);
  socket.on("connect_error", connection.onConnectError);
  for (const name of Object.keys(SERVER_EVENTS) as (keyof ServerToClientEvents)[]) {
    // One generic call per event keeps the handler typed against its own payload.
    (socket as unknown as { on(event: string, handler: unknown): unknown }).on(name, events[name]);
  }
}
