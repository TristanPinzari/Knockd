/** Database rows → API shapes from @knockd/shared. */
import type { Lead, Message, Pin } from "@knockd/shared";
import type { chatMessages, leads } from "../db/schema";

export const toLead = (l: typeof leads.$inferSelect): Lead => ({
  clientId: l.id,
  memberId: l.memberId,
  houseId: l.houseId,
  grade: l.grade,
  note: l.note,
  createdAt: l.createdAt.toISOString(),
  updatedAt: l.updatedAt.toISOString(),
});

export const toMessage = (m: typeof chatMessages.$inferSelect): Message => ({
  clientId: m.id,
  memberId: m.memberId,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

export const toPin = (p: { id: string; memberId: string; createdAt: Date; lat: number; lng: number }): Pin => ({
  clientId: p.id,
  memberId: p.memberId,
  lat: p.lat,
  lng: p.lng,
  createdAt: p.createdAt.toISOString(),
});
