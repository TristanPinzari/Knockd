/**
 * Single seam between the screens and the real map / realtime / location modules.
 * Until Agents 2 and 3 land, these point at local placeholders in ./placeholders.
 * To go live, change each export below to re-export from '@/map' / '@/realtime' / '@/location'.
 * TODO(integration): swap `PlaceholderMap` for `KnockdMap` from '@/map' once props are adapted.
 */
export { PlaceholderMap as MapSlot } from "./placeholders/PlaceholderMap";
export { useMockCrew as useCrewSlot, useMockLocationStatus as useLocationStatusSlot } from "./placeholders/hooks";
export type { MapSlotState } from "./placeholders/PlaceholderMap";
