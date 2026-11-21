/**
 * 👤 Account auth: Auth0 access tokens (RS256, audience = AUTH0_AUDIENCE).
 * The first request from a new Auth0 user creates their `users` row, with their name
 * fetched from Auth0's /userinfo endpoint.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { auth } from "express-oauth2-jwt-bearer";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { HttpError, unauthorized } from "../http/errors";
import { logger } from "../logger";

export interface AccountUser {
  id: string;
  auth0Sub: string;
  displayName: string;
}

const checkJwt =
  env.AUTH0_DOMAIN && env.AUTH0_AUDIENCE
    ? auth({
        issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
        audience: env.AUTH0_AUDIENCE,
        tokenSigningAlg: "RS256",
      })
    : null;

if (!checkJwt) logger.warn("AUTH0_DOMAIN / AUTH0_AUDIENCE not set: account endpoints are disabled");

/** Verifies the Auth0 token and loads (or creates) the user. Throws 401 if invalid. */
async function authenticate(req: Request, res: Response): Promise<AccountUser> {
  if (!checkJwt) throw new HttpError(503, "internal", "Accounts aren't configured on this server");
  await new Promise<void>((resolve, reject) =>
    checkJwt(req, res, ((err?: unknown) =>
      err ? reject(unauthorized("Invalid or expired login")) : resolve()) as NextFunction),
  );
  const sub = req.auth?.payload.sub;
  if (!sub) throw unauthorized("Login token has no subject");
  const token = req.headers.authorization!.slice("Bearer ".length);
  return ensureUser(sub, token);
}

/** 👤 Requires a logged-in user. Puts them in res.locals.user. */
export const requireAccount: RequestHandler = async (req, res, next) => {
  res.locals.user = await authenticate(req, res);
  next();
};

/**
 * Account is optional (create/join session): if an Authorization header is sent it must be a
 * valid login, otherwise the request continues as a guest.
 */
export const optionalAccount: RequestHandler = async (req, res, next) => {
  if (req.headers.authorization) res.locals.user = await authenticate(req, res);
  next();
};

export const accountUser = (res: Response): AccountUser => res.locals.user as AccountUser;
export const maybeAccountUser = (res: Response): AccountUser | undefined => res.locals.user as AccountUser | undefined;

// ---------- users ----------

const cache = new Map<string, { user: AccountUser; at: number }>();
const CACHE_MS = 5 * 60_000;

async function ensureUser(sub: string, accessToken: string): Promise<AccountUser> {
  const cached = cache.get(sub);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.user;

  let [user] = await db
    .select({ id: users.id, auth0Sub: users.auth0Sub, displayName: users.displayName })
    .from(users)
    .where(eq(users.auth0Sub, sub));
  if (!user) {
    const displayName = await fetchName(accessToken);
    await db.insert(users).values({ auth0Sub: sub, displayName }).onConflictDoNothing();
    [user] = await db
      .select({ id: users.id, auth0Sub: users.auth0Sub, displayName: users.displayName })
      .from(users)
      .where(eq(users.auth0Sub, sub));
  }
  cache.set(sub, { user: user!, at: Date.now() });
  return user!;
}

/** Forget a cached user (after they rename themselves). */
export const forgetUser = (sub: string) => cache.delete(sub);

/** Best-effort name from Auth0. Machine-to-machine test tokens have no profile, so fall back. */
async function fetchName(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "New user";
    const info = (await res.json()) as { given_name?: string; name?: string; nickname?: string; email?: string };
    const name = info.given_name || info.name || info.nickname || info.email?.split("@")[0];
    return (name || "New user").slice(0, 40);
  } catch {
    return "New user";
  }
}
