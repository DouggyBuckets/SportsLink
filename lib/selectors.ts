import { gameEnd } from "@/lib/dates";
import { Game, ParticipantStatus } from "@/lib/types";

export const joinedPlayers = (g: Game) => g.participants.filter((p) => p.status === "joined");

export const myStatus = (g: Game, meId: string | undefined): ParticipantStatus | null => g.participants.find((p) => p.user.id === meId)?.status ?? null;

export const isHost = (g: Game, meId: string | undefined) => !!meId && g.host?.id === meId;

export const hasStarted = (g: Game, now = new Date()) => new Date(g.startsAt) <= now;
export const hasEnded = (g: Game, now = new Date()) => gameEnd(g) <= now;

export type Fill = { kind: "full" | "on" | "needs"; label: string };

// "Game on" once the host's minimum is met - the signal that showing up
// won't mean standing around an empty field.
export function fillState(g: Game): Fill {
  const n = joinedPlayers(g).length;
  if (n >= g.capacity) return { kind: "full", label: "Full" };
  if (n >= g.minPlayers) return { kind: "on", label: "Game on" };
  const need = g.minPlayers - n;
  return { kind: "needs", label: `Needs ${need} more` };
}

// Joinable games that haven't started, soonest first.
export const upcomingFeed = (games: Game[], now = new Date()) => games.filter((g) => g.status === "open" && !hasStarted(g, now));

export const myUpcoming = (games: Game[], meId: string | undefined, now = new Date()) =>
  games.filter((g) => g.status === "open" && !hasEnded(g, now) && myStatus(g, meId) !== null);

export const myPast = (games: Game[], meId: string | undefined, now = new Date()) =>
  games
    .filter((g) => g.status !== "cancelled" && hasEnded(g, now) && myStatus(g, meId) === "joined")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

// After a game, the host has HOST_MARK_HOURS from the end to mark who came.
// If they don't, the players vote until VOTE_CLOSE_HOURS after the end, and
// the majority answer for each player counts. Mirrors `mark_attendance`,
// `vote_attendance` and `settle_attendance_votes` in the SQL migrations.
export const HOST_MARK_HOURS = 24;
export const VOTE_CLOSE_HOURS = 72;

export type AttendancePhase = "none" | "host" | "vote" | "settled" | "expired";

export function attendancePhase(g: Game, now = new Date()): AttendancePhase {
  if (g.status === "cancelled" || !hasStarted(g, now)) return "none";
  if (g.attendanceBy) return "settled";
  const hoursSinceEnd = (now.getTime() - gameEnd(g).getTime()) / 3_600_000;
  if (hoursSinceEnd < HOST_MARK_HOURS) return "host";
  if (hoursSinceEnd < VOTE_CLOSE_HOURS) return "vote";
  return "expired";
}

const othersIn = (g: Game, meId: string | undefined) => joinedPlayers(g).some((p) => p.user.id !== meId);

// A hosted game that has kicked off and is waiting on the host to mark it.
export const needsAttendance = (g: Game, meId: string | undefined, now = new Date()) => isHost(g, meId) && othersIn(g, meId) && attendancePhase(g, now) === "host";

// A game the viewer played whose host missed the deadline: they can vote.
export const canVote = (g: Game, meId: string | undefined, now = new Date()) =>
  myStatus(g, meId) === "joined" && othersIn(g, meId) && attendancePhase(g, now) === "vote" && g.attendanceVote !== null;

export const hasVoted = (g: Game) => Object.keys(g.attendanceVote?.mine ?? {}).length > 0;
