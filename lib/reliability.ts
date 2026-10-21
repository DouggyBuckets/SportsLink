import { Game, MiniProfile } from "@/lib/types";

// The reliability score. Everyone starts at 100%. Each game a host marks
// counts as showed up or missed (as does leaving within LATE_LEAVE_HOURS of
// kickoff), and the score is the share of games attended, with every player
// credited two free "showed up" games so one early miss reads as 67%, not 0%.
// Must stay in sync with the `reliability` column on profiles in the SQL
// migrations.
export const FREE_GAMES = 2;

export function reliabilityScore(attended: number, noShows: number): number {
  return Math.round(((attended + FREE_GAMES) * 100) / (attended + noShows + FREE_GAMES));
}

export const isNewPlayer = (u: Pick<MiniProfile, "ratedGames">) => u.ratedGames === 0;

// What a host can require. 0 is "open to everyone".
export const MIN_RELIABILITY_OPTIONS = [0, 70, 80, 90];

export const minReliabilityLabel = (min: number) => (min === 0 ? "Open to everyone" : `Min reliability: ${min}%`);

export const meetsMinimum = (u: Pick<MiniProfile, "reliability">, min: number) => u.reliability >= min;

export type ReliabilityTone = "success" | "warning" | "danger" | "neutral";

export function reliabilityTone(u: Pick<MiniProfile, "reliability" | "ratedGames">): ReliabilityTone {
  if (isNewPlayer(u)) return "neutral";
  if (u.reliability >= 85) return "success";
  if (u.reliability >= 70) return "warning";
  return "danger";
}

// One-word-ish verdict shown next to the score on a profile.
export function reliabilityTier(u: Pick<MiniProfile, "reliability" | "ratedGames">): string {
  if (isNewPlayer(u)) return "New player";
  if (u.reliability >= 85) return "Very reliable";
  if (u.reliability >= 70) return "Usually shows up";
  return "Often misses games";
}

export const reliabilityLabel = (u: Pick<MiniProfile, "reliability" | "ratedGames">) => (isNewPlayer(u) ? "New player" : `${u.reliability}% reliable`);

// Leaving a game is free until this close to kickoff; after that it counts
// as a miss. Mirrors LATE_LEAVE_WINDOW in the SQL migrations.
export const LATE_LEAVE_HOURS = 2;

export const isLateLeave = (g: Pick<Game, "startsAt">, now = Date.now()) => new Date(g.startsAt).getTime() - now < LATE_LEAVE_HOURS * 3_600_000;
