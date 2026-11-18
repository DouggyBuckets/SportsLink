import { gameEnd } from "@/lib/dates";
import { locationById, OTHER_LOCATION_ID } from "@/lib/locations";
import { myStatus } from "@/lib/selectors";
import { Game } from "@/lib/types";

// Location check-in. A player at the field can check in from an hour before
// kickoff to an hour after. It counts as showing up straight away, and the
// host's marks and the player vote can't override it. Only listed fields
// have coordinates, so custom places fall back to the host marking.
// Mirrors `check_in` in the SQL migrations.
export const CHECK_IN_RADIUS_M = 250;
export const CHECK_IN_OPENS_MIN = 60;
export const CHECK_IN_CLOSES_MIN = 60;

// Great-circle distance in meters.
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const checkInField = (g: Pick<Game, "locationId">) => (g.locationId === OTHER_LOCATION_ID ? undefined : locationById(g.locationId));

export type CheckInState = "none" | "early" | "open" | "done";

// What the viewer's check-in for a game looks like right now. "none" = not
// theirs to check in to (not in it, no field, cancelled or too late).
export function checkInState(g: Game, meId: string | undefined, now = Date.now()): CheckInState {
  if (myStatus(g, meId) !== "joined" || g.status === "cancelled" || !checkInField(g)) return "none";
  if (g.participants.find((p) => p.user.id === meId)?.checkedInAt) return "done";
  const start = new Date(g.startsAt).getTime();
  if (now > start + CHECK_IN_CLOSES_MIN * 60_000 || now > gameEnd(g).getTime()) return "none";
  if (now < start - CHECK_IN_OPENS_MIN * 60_000) return start - now < 24 * 3_600_000 ? "early" : "none";
  return "open";
}
