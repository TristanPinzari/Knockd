/**
 * Session tokens: issued on create/join, sent as `Authorization: Bearer <token>` on 🎟️ endpoints
 * and as `auth.token` on the socket. Identifies one member of one session.
 */
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

const secret = new TextEncoder().encode(env.GUEST_TOKEN_SECRET);
const ISSUER = "knockd";
const AUDIENCE = "knockd-session";
/** Long enough to cover a full day plus the 7-day upload grace period. */
const TTL = "8d";

export interface SessionClaims {
  sessionId: string;
  memberId: string;
}

export async function signSessionToken({ sessionId, memberId }: SessionClaims): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(memberId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret);
}

/** Returns the claims, or null if the token is invalid or expired. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    return { sessionId: payload.sid, memberId: payload.sub };
  } catch {
    return null;
  }
}
