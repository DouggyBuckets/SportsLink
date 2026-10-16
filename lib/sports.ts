import { Game, SkillLevel, SportId } from "@/lib/types";

export type SportMeta = {
  id: SportId;
  name: string;
  // SF Symbol name.
  icon: string;
  color: string;
  formats: string[];
  defaultCapacity: number;
};

const s = (id: string, name: string, icon: string, color: string, formats: string[], defaultCapacity: number): SportMeta => ({ id, name, icon, color, formats, defaultCapacity });

// MVP1 is soccer only. Mirrors the `sports` table seeded in supabase/migrations
// (regenerate with scripts/gen-seed.py after editing). Kept as a list so more
// sports can come back later without reshaping the data.
export const SPORTS: SportMeta[] = [s("soccer", "Soccer", "soccerball", "#2E9E5B", ["5v5", "7v7", "11v11"], 10)];

export const SOCCER: SportId = "soccer";

const BY_ID = Object.fromEntries(SPORTS.map((x) => [x.id, x]));

// Unknown ids (old data from before MVP1) render with soccer's look rather
// than crashing.
export const sportMeta = (id: SportId): SportMeta => BY_ID[id] ?? { ...BY_ID[SOCCER], id, name: id.charAt(0).toUpperCase() + id.slice(1) };

// How many players a format implies: "Game on" once both sides are full
// (minPlayers), plus a couple of sub spots on top (capacity). The host can
// change both.
export const DEFAULT_SUBS = 2;

export function formatSizing(format: string, sport: SportId): { capacity: number; minPlayers: number } {
  const teams = format.match(/(\d+)v\d+$/);
  if (teams) {
    const full = Number(teams[1]) * 2;
    return { capacity: full + DEFAULT_SUBS, minPlayers: full };
  }
  return { capacity: sportMeta(sport).defaultCapacity, minPlayers: 2 };
}

// "Soccer 5v5"
export const gameTitle = (g: Pick<Game, "sport" | "customSport" | "format">) => `${g.sport === "other" && g.customSport ? g.customSport : sportMeta(g.sport).name} ${g.format}`.trim();

export const SKILLS: { value: SkillLevel; label: string; blurb: string }[] = [
  { value: "any", label: "All levels", blurb: "Everyone welcome" },
  { value: "casual", label: "Casual", blurb: "Just for fun" },
  { value: "intermediate", label: "Intermediate", blurb: "Played before, know the rules" },
  { value: "competitive", label: "Competitive", blurb: "High school varsity / club level" },
];

export const skillLabel = (k: SkillLevel) => SKILLS.find((x) => x.value === k)!.label;
