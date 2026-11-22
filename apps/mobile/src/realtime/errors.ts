import type { ErrorCode } from "@knockd/shared";

/** The server answered with a non-2xx status. */
export class ApiRequestError extends Error {
  readonly kind = "api" as const;
  constructor(
    readonly status: number,
    readonly code: ErrorCode | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** No answer: offline, DNS, timeout or the request was aborted. Always safe to retry. */
export class NetworkError extends Error {
  readonly kind = "network" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** The server answered 2xx but the body did not match the shared schema. */
export class ResponseShapeError extends Error {
  readonly kind = "shape" as const;
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "ResponseShapeError";
  }
}

export type ApiFailure = ApiRequestError | NetworkError | ResponseShapeError;

/** What the outbox should do with a failed request. */
export type FailureAction = "retry" | "drop" | "auth" | "ended";

export function classifyFailure(error: unknown): FailureAction {
  if (error instanceof NetworkError) return "retry";
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "auth";
    if (error.status === 410 || error.code === "session_ended" || error.code === "session_not_found") return "ended";
    if (error.status === 408 || error.status === 429 || error.status >= 500) return "retry";
    return "drop"; // 400/403/404/409: retrying the same payload can never succeed
  }
  if (error instanceof ResponseShapeError) return "drop";
  return "retry"; // unknown: keep the data, try again later
}
