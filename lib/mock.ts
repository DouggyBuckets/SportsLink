import { locationsForSport, OTHER_LOCATION_ID } from "@/lib/locations";
import { reliabilityScore } from "@/lib/reliability";
import { formatSizing, SOCCER, sportMeta } from "@/lib/sports";
import { AvailabilityBlock, ClassYear, Game, MiniProfile, Participant, Profile, SkillLevel, SportId } from "@/lib/types";

// Demo-mode world: a campus worth of fake students and two rolling weeks of
// soccer games generated relative to "now", so the app always looks alive without
// a backend. Deterministic (seeded) so the feed doesn't reshuffle on reload.

export const ME_ID = "me";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const NAMES = [
  "Alex Chen", "Maya Patel", "Jordan Williams", "Sofia Rodriguez", "Ethan Kim", "Priya Shah", "Marcus Johnson", "Hannah Becker",
  "Diego Alvarez", "Emma Novak", "Tyler Brooks", "Aisha Rahman", "Noah Goldberg", "Grace Liu", "Owen Murphy", "Zoe Washington",
  "Lucas Meyer", "Nina Kowalski", "Caleb Turner", "Isabel Tran", "Ravi Gupta", "Chloe Anderson", "Sam Okafor", "Leah Friedman",
];

const YEARS: ClassYear[] = ["Freshman", "Sophomore", "Junior", "Senior", "Grad"];
const SKILL_POOL: SkillLevel[] = ["casual", "intermediate", "intermediate", "competitive"];

export type MockUser = Profile & { availability: AvailabilityBlock[]; interests: SportId[] };

function buildUsers(): MockUser[] {
  const rand = rng(441);
  return NAMES.map((name, i) => {
    const [first, last] = name.toLowerCase().split(" ");
    const sports = [{ sport: SOCCER, skill: SKILL_POOL[Math.floor(rand() * SKILL_POOL.length)] }];
    // Most students are free late afternoon / evening on a few weekdays,
    // plus a weekend chunk - the same shape as a real class schedule.
    const availability: AvailabilityBlock[] = [];
    for (let day = 1; day <= 5; day++) {
      if (rand() < 0.6) {
        const start = 15 + Math.floor(rand() * 4);
        availability.push({ day, start: start * 60, end: Math.min(23, start + 2 + Math.floor(rand() * 4)) * 60 });
      }
    }
    if (rand() < 0.7) availability.push({ day: 6, start: 10 * 60, end: 18 * 60 });
    if (rand() < 0.6) availability.push({ day: 0, start: 12 * 60, end: 20 * 60 });
    // A few brand-new players; the rest have a history with the odd no-show
    // (and a couple of genuinely flaky ones).
    const played = i % 7 === 3 ? 0 : 2 + Math.floor(rand() * 30);
    const noShows = played === 0 ? 0 : Math.floor(played * (i % 9 === 5 ? 0.35 : rand() * 0.15));
    return {
      id: `u${i + 1}`,
      name,
      uniqname: `${first[0]}${last}`.slice(0, 8),
      reliability: reliabilityScore(played - noShows, noShows),
      ratedGames: played,
      classYear: YEARS[Math.floor(rand() * YEARS.length)],
      bio: "",
      sports,
      gamesPlayed: played,
      gamesHosted: Math.floor(played / 6),
      attended: played - noShows,
      availability,
      interests: rand() < 0.75 ? [SOCCER] : [],
    };
  });
}

export const MOCK_USERS: MockUser[] = buildUsers();

export const mini = (u: Profile): MiniProfile => ({ id: u.id, name: u.name, uniqname: u.uniqname, reliability: u.reliability, ratedGames: u.ratedGames });

export const mockUserById = (id: string) => MOCK_USERS.find((u) => u.id === id);

const SLOTS = [
  { h: 6, m: 30 }, { h: 21, m: 30 }, { h: 12, m: 0 }, { h: 15, m: 30 }, { h: 16, m: 30 }, { h: 17, m: 0 }, { h: 17, m: 30 }, { h: 18, m: 30 }, { h: 19, m: 0 }, { h: 20, m: 0 },
];

const NOTES = [
  "Bring a light and dark shirt.",
  "Casual game, all welcome. We have a ball and cones.",
  "Looking for a couple more to round out teams.",
  "We play every week - come through!",
  "Turf, so cleats or turf shoes.",
  "",
  "",
];

function participants(rand: () => number, host: MockUser | null, joined: number, startsAt: Date, minReliability = 0): Participant[] {
  // Only players who meet the game's minimum could have joined it.
  const pool = MOCK_USERS.filter((u) => u.id !== host?.id && u.reliability >= minReliability).sort(() => rand() - 0.5);
  const hoursOut = (startsAt.getTime() - Date.now()) / 3_600_000;
  const make = (u: MockUser, status: Participant["status"], i: number): Participant => ({
    user: mini(u),
    status,
    joinedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    confirmed: status === "joined" && hoursOut < 24 && rand() < 0.7,
    attended: null,
  });
  const list: Participant[] = host ? [{ ...make(host, "joined", 99), confirmed: true }] : [];
  const others = Math.max(0, joined - list.length);
  pool.slice(0, others).forEach((u, i) => list.push(make(u, "joined", i)));
  return list;
}

export function buildGames(now = new Date()): Game[] {
  const rand = rng(now.getFullYear() * 1000 + now.getMonth() * 50 + now.getDate());
  const games: Game[] = [];
  let n = 0;

  for (let offset = 0; offset < 14; offset++) {
    const perDay = 3 + Math.floor(rand() * 3);
    const slots = [...SLOTS].sort(() => rand() - 0.5).slice(0, perDay);
    for (const slot of slots) {
      const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, slot.h, slot.m);
      if (startsAt.getTime() < now.getTime() + 30 * 60_000) continue;
      const sport = SOCCER;
      const meta = sportMeta(sport);
      const format = meta.formats[Math.floor(rand() * meta.formats.length)];
      const { capacity, minPlayers } = formatSizing(format, sport);
      const places = locationsForSport(sport).filter((l) => l.id !== OTHER_LOCATION_ID);
      const location = places[Math.floor(rand() * places.length)];
      const host = MOCK_USERS[Math.floor(rand() * MOCK_USERS.length)];
      const fillRoll = rand();
      const joined = fillRoll < 0.15 ? capacity : Math.max(1, Math.round(capacity * (0.3 + fillRoll * 0.65)));
      const minPick = [0, 0, 70, 80, 90][Math.floor(rand() * 5)];
      // A host can't require a score they don't have themselves.
      const minReliability = host.reliability >= minPick ? minPick : 0;
      games.push({
        id: `g${++n}`,
        sport,
        customSport: "",
        format,
        locationId: location.id,
        locationNote: location.indoor ? `Court ${1 + Math.floor(rand() * 2)}` : "",
        startsAt: startsAt.toISOString(),
        durationMin: [60, 90, 90, 120][Math.floor(rand() * 4)],
        capacity,
        minPlayers,
        skill: (["any", "any", "casual", "intermediate", "competitive"] as SkillLevel[])[Math.floor(rand() * 5)],
        minReliability,
        notes: NOTES[Math.floor(rand() * NOTES.length)],
        host: mini(host),
        isOfficial: false,
        visibility: "campus",
        status: "open",
        participants: participants(rand, host, Math.min(joined, capacity), startsAt, minReliability),
      });
    }
  }
  return games.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// Past games the viewer played, so the profile's reliability card, history
// and the host's attendance flow all have something to show on a fresh
// install: eight showed up, one no-show (91%), three hosted - the newest of
// which is still waiting for the viewer to mark attendance.
type PastOutcome = "showed" | "missed" | "unmarked";
const PAST: { days: number; format: string; locationId: string; hostedByMe: boolean; outcome: PastOutcome }[] = [
  { days: 2, format: "5v5", locationId: "mitchell", hostedByMe: true, outcome: "unmarked" },
  { days: 4, format: "7v7", locationId: "palmer-field", hostedByMe: false, outcome: "showed" },
  { days: 6, format: "5v5", locationId: "hadley", hostedByMe: true, outcome: "showed" },
  { days: 9, format: "7v7", locationId: "hubbard-turf", hostedByMe: false, outcome: "showed" },
  { days: 11, format: "11v11", locationId: "fuller-park", hostedByMe: false, outcome: "missed" },
  { days: 14, format: "5v5", locationId: "coliseum", hostedByMe: false, outcome: "showed" },
  { days: 17, format: "7v7", locationId: "burns-park", hostedByMe: true, outcome: "showed" },
  { days: 20, format: "5v5", locationId: "mitchell", hostedByMe: false, outcome: "showed" },
  { days: 24, format: "7v7", locationId: "palmer-field", hostedByMe: false, outcome: "showed" },
  { days: 28, format: "5v5", locationId: "hadley", hostedByMe: false, outcome: "showed" },
];

// The viewer's profile numbers implied by buildHistory.
export function historyStats() {
  const attended = PAST.filter((p) => p.outcome === "showed").length;
  const missed = PAST.filter((p) => p.outcome === "missed").length;
  return {
    attended,
    ratedGames: attended + missed,
    reliability: reliabilityScore(attended, missed),
    gamesPlayed: PAST.filter((p) => p.outcome !== "missed").length,
    gamesHosted: PAST.filter((p) => p.hostedByMe).length,
  };
}

export function buildHistory(me: MiniProfile, now = new Date()): Game[] {
  const rand = rng(7);
  return PAST.map((p, i) => {
    const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - p.days, 17, 0);
    const host = p.hostedByMe ? null : MOCK_USERS[(i * 3 + 2) % MOCK_USERS.length];
    const { capacity, minPlayers } = formatSizing(p.format, SOCCER);
    const unmarked = p.outcome === "unmarked";
    const others = participants(rand, host, minPlayers - 1, startsAt).map((x) => ({ ...x, confirmed: true, attended: unmarked ? null : true }));
    const mine: Participant = { user: me, status: "joined", joinedAt: startsAt.toISOString(), confirmed: true, attended: unmarked ? null : p.outcome === "showed" };
    return {
      id: `h${i + 1}`,
      sport: SOCCER,
      customSport: "",
      format: p.format,
      locationId: p.locationId,
      locationNote: "",
      startsAt: startsAt.toISOString(),
      durationMin: 90,
      capacity,
      minPlayers,
      skill: "any",
      minReliability: 0,
      notes: "",
      host: p.hostedByMe ? me : mini(host!),
      isOfficial: false,
      visibility: "campus",
      status: "completed",
      participants: [mine, ...others],
    };
  });
}

// Two upcoming games the viewer is already in: one kicking off in about an
// hour (inside the late-leave window, to show that warning) and one they're
// hosting tomorrow evening.
export function buildMyUpcoming(me: MiniProfile, now = new Date()): Game[] {
  const rand = rng(11);
  const soon = new Date(Math.ceil((now.getTime() + 75 * 60_000) / (5 * 60_000)) * 5 * 60_000);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0);
  const host = MOCK_USERS.find((u) => u.ratedGames > 0 && u.reliability >= 90) ?? MOCK_USERS[0];
  const base = { sport: SOCCER, customSport: "", locationNote: "", durationMin: 90, skill: "any" as SkillLevel, notes: "", isOfficial: false, visibility: "campus" as const, status: "open" as const };
  const joinedNow = (u: MiniProfile, hosting: boolean): Participant => ({ user: u, status: "joined", joinedAt: new Date(now.getTime() - 3_600_000).toISOString(), confirmed: hosting, attended: null });
  const soonSize = formatSizing("5v5", SOCCER);
  const hostSize = formatSizing("7v7", SOCCER);
  return [
    {
      ...base,
      id: "d-soon",
      format: "5v5",
      locationId: "mitchell",
      startsAt: soon.toISOString(),
      ...soonSize,
      minReliability: 80,
      notes: "Bring a dark and a light shirt.",
      host: mini(host),
      participants: [...participants(rand, host, soonSize.minPlayers - 2, soon, 80), joinedNow(me, false)],
    },
    {
      ...base,
      id: "d-host",
      format: "7v7",
      locationId: "palmer-field",
      startsAt: tomorrow.toISOString(),
      ...hostSize,
      minReliability: 70,
      host: me,
      participants: [joinedNow(me, true), ...participants(rand, null, 6, tomorrow, 70)],
    },
  ];
}
