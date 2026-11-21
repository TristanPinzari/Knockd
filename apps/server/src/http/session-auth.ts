/**
 * 🎟️ endpoints: require a session token for the session in the URL (`:id`).
 * Puts { sessionId, memberId } in res.locals.ctx.
 */
import type { RequestHandler, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { verifySessionToken, type SessionClaims } from "../auth/session-token";
import { db } from "../db/client";
import { sessionMembers } from "../db/schema";
import { forbidden, unauthorized } from "./errors";

export const requireSession: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const claims = token ? await verifySessionToken(token) : null;
  if (!claims) throw unauthorized("Missing or invalid session token");
  if (req.params.id !== claims.sessionId) throw forbidden("Token is for a different session");

  const [member] = await db
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(
      and(
        eq(sessionMembers.id, claims.memberId),
        eq(sessionMembers.sessionId, claims.sessionId),
        isNull(sessionMembers.removedAt),
      ),
    );
  if (!member) throw forbidden("You're no longer in this session");

  res.locals.ctx = claims;
  next();
};

export const sessionCtx = (res: Response): SessionClaims => res.locals.ctx as SessionClaims;
