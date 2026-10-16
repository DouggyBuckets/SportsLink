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

// A hosted game that has kicked off but whose attendance is still unmarked.
export const needsAttendance = (g: Game, meId: string | undefined, now = new Date()) =>
  isHost(g, meId) && hasStarted(g, now) && g.status !== "cancelled" && joinedPlayers(g).some((p) => p.attended === null && p.user.id !== meId);
