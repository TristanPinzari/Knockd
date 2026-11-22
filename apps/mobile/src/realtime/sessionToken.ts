/**
 * Reads the ids out of a session token (a JWT with `sid` = session id, `sub` = member id).
 * The payload is NOT verified here: it is only used to know which session/member we are, and the
 * server checks the signature on every request and socket connection.
 */
import { z } from "zod";

export interface SessionClaims {
  sessionId: string;
  memberId: string;
}

const Payload = z.object({ sid: z.string().min(1), sub: z.string().min(1) });
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64url -> UTF-8 string, without relying on atob/Buffer being present. */
export function decodeBase64Url(input: string): string {
  const clean = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = B64.indexOf(char);
    if (value < 0) throw new Error("Invalid base64 character");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, "0")}`).join(""));
}

export function decodeSessionClaims(token: string): SessionClaims | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const parsed = Payload.safeParse(JSON.parse(decodeBase64Url(part)));
    return parsed.success ? { sessionId: parsed.data.sid, memberId: parsed.data.sub } : null;
  } catch {
    return null;
  }
}
