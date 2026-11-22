/** Test helpers shared by the realtime/location/trails specs. Not imported by app code. */
import type { Lead, Member } from "@knockd/shared";

let counter = 0;
/** Deterministic valid UUID v4-shaped ids. */
export function uuid(n: number = ++counter): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function member(id: string, name = "Member", extra: Partial<Member> = {}): Member {
  return {
    id,
    displayName: name,
    colour: "#1F6FD6",
    isGuest: true,
    isBot: false,
    online: true,
    lastPosition: null,
    ...extra,
  };
}

export function lead(clientId: string, memberId: string, grade: Lead["grade"] = "A", extra: Partial<Lead> = {}): Lead {
  return {
    clientId,
    memberId,
    houseId: 1,
    grade,
    note: null,
    createdAt: "2026-11-21T15:00:00.000Z",
    updatedAt: "2026-11-21T15:00:00.000Z",
    ...extra,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
