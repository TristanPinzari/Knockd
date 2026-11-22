/**
 * Places leads on the map via the house centre index. Leads on houses we have not loaded yet are left
 * out until their cell arrives. Past leads (GET /layers) are added for houses without a live lead.
 */
import type { Lead } from "@knockd/shared";
import type { MapLead } from "@/map/types";
import type { PastLeadInfo } from "./areaModel";
import type { HouseInfo } from "./features";

export const PAST_LEAD_ID_PREFIX = "past-";

export function placeLeads(
  leads: Readonly<Record<string, Lead>>,
  houses: Readonly<Record<string, HouseInfo>>,
  pastLeads: Readonly<Record<string, PastLeadInfo>> = {},
): MapLead[] {
  const live = Object.values(leads).flatMap((lead) => {
    const house = houses[String(lead.houseId)];
    return house ? [{ id: lead.clientId, lng: house.centre[0], lat: house.centre[1], grade: lead.grade }] : [];
  });
  const liveHouses = new Set(Object.values(leads).map((l) => String(l.houseId)));
  const past = Object.values(pastLeads).flatMap((p) => {
    const house = houses[p.houseId];
    if (!house || liveHouses.has(p.houseId)) return [];
    return [
      {
        id: `${PAST_LEAD_ID_PREFIX}${p.houseId}`,
        lng: house.centre[0],
        lat: house.centre[1],
        grade: p.grade,
        past: true,
      },
    ];
  });
  return [...live, ...past];
}
