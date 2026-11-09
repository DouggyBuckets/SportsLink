import { AttendanceMark, Game, MiniProfile, Profile, ScoreEvent } from "@/lib/types";

// The reliability score. Everyone starts at 100%. Each game that counts earns
// credit for how the player did (see MARK_CREDIT), leaving within
// LATE_LEAVE_HOURS of kickoff earns none, and the score is the average credit
// with every player given two free full-credit games, so one early miss
// reads as 67%, not 0%.
//
// Misses fade: the credit a game didn't earn counts MISS_DECAY times less for
// each full week since it, so an older miss slowly turns back into a show and
// a low score recovers on its own (faster by playing more games).
//
// Must stay in sync with `_reliability` in the SQL migrations.
export const FREE_GAMES = 2;
export const MISS_DECAY = 0.85;

export const MARK_CREDIT: Record<AttendanceMark, number> = { present: 1, late: 0.75, left_early: 0.5, no_show: 0 };

export const MARK_LABEL: Record<AttendanceMark, string> = { present: "Present", late: "Late", left_early: "Left early", no_show: "No-show" };

const WEEK_MS = 7 * 24 * 3_600_000;

// Share of a game's missing credit that still counts at time `now`.
export const missWeight = (at: string, now = Date.now()) => MISS_DECAY ** Math.max(0, Math.floor((now - new Date(at).getTime()) / WEEK_MS));

// Score from the games that count. `extraGames` adds that many full-credit
// games played at `now` (to answer "what if I play 2 more?").
export function scoreFromEvents(events: ScoreEvent[], now = Date.now(), extraGames = 0): number {
  const counted = events.filter((e) => new Date(e.at).getTime() <= now);
  const missing = counted.reduce((sum, e) => sum + (1 - e.credit) * missWeight(e.at, now), 0);
  const n = counted.length + extraGames;
  return Math.round(((n + FREE_GAMES - missing) * 100) / (n + FREE_GAMES));
}

// The simple form, for players whose games we don't have (demo players):
// every miss at full weight.
export function reliabilityScore(attended: number, noShows: number): number {
  return Math.round(((attended + FREE_GAMES) * 100) / (attended + noShows + FREE_GAMES));
}

export const isNewPlayer = (u: Pick<MiniProfile, "ratedGames">) => u.ratedGames === 0;

// What a host can require. 0 is "open to everyone".
export const MIN_RELIABILITY_OPTIONS = [0, 70, 80, 90];

export const minReliabilityLabel = (min: number) => (min === 0 ? "Open to everyone" : `Min reliability: ${min}%`);

export const meetsMinimum = (u: Pick<MiniProfile, "reliability">, min: number) => u.reliability >= min;

// ── Recovery ────────────────────────────────────────────────────────────

const MAX_WEEKS = 26;
const MAX_GAMES = 20;

// Change in the score over the last week (0 when there's no history).
export function weeklyChange(events: ScoreEvent[], now = Date.now()): number {
  if (events.length === 0) return 0;
  return scoreFromEvents(events, now) - scoreFromEvents(events, now - WEEK_MS);
}

// Full weeks until the score reaches `target` with no new games, or null if
// that's more than half a year away.
export function weeksUntil(events: ScoreEvent[], target: number, now = Date.now()): number | null {
  for (let w = 0; w <= MAX_WEEKS; w++) if (scoreFromEvents(events, now + w * WEEK_MS) >= target) return w;
  return null;
}

// Full-credit games needed now to reach `target`, or null if out of reach.
export function gamesUntil(events: ScoreEvent[], target: number, now = Date.now()): number | null {
  for (let g = 0; g <= MAX_GAMES; g++) if (scoreFromEvents(events, now, g) >= target) return g;
  return null;
}

// The next minimum a host can set that the player is below, if any.
export const nextThreshold = (score: number) => MIN_RELIABILITY_OPTIONS.find((m) => m > score) ?? null;

export const weeksLabel = (weeks: number) => (weeks <= 1 ? "about a week" : `about ${weeks} weeks`);

// "~2 weeks": how soon a player locked out of a game will meet its minimum
// without playing. Own profile only (needs scoreEvents); null if it's more
// than two months off.
export function qualifyIn(u: Pick<Profile, "scoreEvents">, min: number, now = Date.now()): string | null {
  if (!u.scoreEvents?.length) return null;
  const weeks = weeksUntil(u.scoreEvents, min, now);
  if (weeks === null || weeks === 0 || weeks > 8) return null;
  return weeks === 1 ? "~1 week" : `~${weeks} weeks`;
}

// ── Labels ──────────────────────────────────────────────────────────────

export type ReliabilityTone = "success" | "warning" | "danger" | "neutral";

export function reliabilityTone(u: Pick<MiniProfile, "reliability" | "ratedGames">): ReliabilityTone {
  if (isNewPlayer(u)) return "neutral";
  if (u.reliability >= 85) return "success";
  if (u.reliability >= 70) return "warning";
  return "danger";
}

// One-word-ish verdict shown next to the score on a profile. `rising` (own
// profile only) marks a below-par score that went up this week.
export function reliabilityTier(u: Pick<MiniProfile, "reliability" | "ratedGames">, rising = false): string {
  if (isNewPlayer(u)) return "New player";
  if (u.reliability >= 85) return "Very reliable";
  if (rising) return "Recovering";
  if (u.reliability >= 70) return "Usually shows up";
  return "Often misses games";
}

export const reliabilityLabel = (u: Pick<MiniProfile, "reliability" | "ratedGames">) => (isNewPlayer(u) ? "New player" : `${u.reliability}% reliable`);

// Leaving a game is free until this close to kickoff; after that it counts
// as a miss. Mirrors LATE_LEAVE_WINDOW in the SQL migrations.
export const LATE_LEAVE_HOURS = 2;

export const isLateLeave = (g: Pick<Game, "startsAt">, now = Date.now()) => new Date(g.startsAt).getTime() - now < LATE_LEAVE_HOURS * 3_600_000;
