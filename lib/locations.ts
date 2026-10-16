import { SportId } from "@/lib/types";

export type Location = {
  id: string;
  name: string;
  area: "Central" | "North" | "South" | "Hill";
  address: string;
  lat: number;
  lng: number;
  indoor: boolean;
  sports: SportId[];
};

// Mirrors the `locations` table seeded in supabase/migrations.
// "other" is the escape hatch: any park, driveway or dorm lawn, described
// by the host in the game's location note.
export const OTHER_LOCATION_ID = "other";

// Mirrors the `locations` table seeded in supabase/migrations: the places to
// play soccer around campus. Checked against Michigan Recreation for fall
// 2026: the Hadley Center opened June 2026 on the site of the demolished CCRB,
// and the old Elbel Field is now residence halls (its replacement is the
// Hubbard Road turf on North Campus).
export const LOCATIONS: Location[] = [
  { id: "hadley", name: "Hadley Rec Center", area: "Central", address: "401 Washtenaw Ave", lat: 42.2812, lng: -83.7334, indoor: true, sports: ["soccer"] },
  { id: "coliseum", name: "Sports Coliseum", area: "South", address: "721 S Fifth Ave", lat: 42.2722, lng: -83.7475, indoor: true, sports: ["soccer"] },
  { id: "palmer-field", name: "Palmer Field", area: "Hill", address: "Washington Hts", lat: 42.2812, lng: -83.7296, indoor: false, sports: ["soccer"] },
  { id: "mitchell", name: "Mitchell Field", area: "Hill", address: "1900 Fuller Rd", lat: 42.2869, lng: -83.7203, indoor: false, sports: ["soccer"] },
  { id: "hubbard-turf", name: "Hubbard Road Turf Fields", area: "North", address: "Hubbard Rd, west of NCRB", lat: 42.2953, lng: -83.7222, indoor: false, sports: ["soccer"] },
  { id: "fuller-park", name: "Fuller Park", area: "Hill", address: "1519 Fuller Rd", lat: 42.2878, lng: -83.7262, indoor: false, sports: ["soccer"] },
  { id: "burns-park", name: "Burns Park", area: "South", address: "1414 Wells St", lat: 42.2659, lng: -83.7312, indoor: false, sports: ["soccer"] },
  { id: "other", name: "Somewhere else", area: "Central", address: "", lat: 42.278, lng: -83.7382, indoor: false, sports: [] },
];

const BY_ID = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

export const locationById = (id: string): Location | undefined => BY_ID[id];

// Sports with no listed venue can go anywhere. "Somewhere else" is always
// offered last.
export const locationsForSport = (sport: SportId) => {
  const matches = LOCATIONS.filter((l) => l.sports.includes(sport));
  const other = LOCATIONS.filter((l) => l.id === OTHER_LOCATION_ID);
  return matches.length > 0 ? [...matches, ...other] : LOCATIONS;
};

// What to call a game's venue. Custom places are named by the host's note.
export function placeName(g: { locationId: string; locationNote: string }): string {
  const known = BY_ID[g.locationId];
  if (!known || g.locationId === OTHER_LOCATION_ID) return g.locationNote || "Location TBD";
  return g.locationNote ? `${known.name} · ${g.locationNote}` : known.name;
}

// Custom places have no coordinates: search Maps for what the host typed.
export const mapsUrl = (g: { locationId: string; locationNote: string }) => {
  const l = BY_ID[g.locationId];
  if (!l || g.locationId === OTHER_LOCATION_ID) return `http://maps.apple.com/?q=${encodeURIComponent(`${g.locationNote} Ann Arbor MI`)}`;
  return `http://maps.apple.com/?ll=${l.lat},${l.lng}&q=${encodeURIComponent(l.name)}`;
};
