import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiError, ErrorCode } from "@knockd/shared";
import type { z } from "zod";
import { logger } from "../logger";

/** Throw from a route to send `{ error: { code, message } }` with this status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, "not_found", what);
export const forbidden = (why = "Forbidden") => new HttpError(403, "forbidden", why);
export const unauthorized = (why = "Unauthorized") => new HttpError(401, "unauthorized", why);

/** Parses input with a Zod schema, turning failures into a 400 with a readable message. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new HttpError(400, "invalid_request", message);
  }
  return result.data;
}

export const unknownRoute: RequestHandler = (_req, _res, next) => next(notFound("No such endpoint"));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    res.status(err.status).json(body);
    return;
  }
  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "invalid_request", message: "Malformed JSON body" } } satisfies ApiError);
    return;
  }
  logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } } satisfies ApiError);
};
