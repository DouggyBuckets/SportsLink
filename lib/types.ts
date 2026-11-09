// Row id in the `sports` table (see lib/sports.ts for the bundled copy).
// A plain string so new sports can ship from the database without an update.
export type SportId = string;

export type SkillLevel = "any" | "casual" | "intermediate" | "competitive";

export type ClassYear = "Freshman" | "Sophomore" | "Junior" | "Senior" | "Grad";

// A weekly recurring free window. day: 0 = Sunday. Minutes from local midnight.
export type AvailabilityBlock = { day: number; start: number; end: number };

export type MiniProfile = {
  id: string;
  name: string;
  uniqname: string;
  // Reliability score, 0-100. Everyone starts at 100 and it moves as hosts
  // mark attendance - see lib/reliability.ts.
  reliability: number;
  // Games that count toward the score: marked present, marked a no-show, or
  // left too close to kickoff. 0 = new player.
  ratedGames: number;
};

export type Profile = MiniProfile & {
  classYear: ClassYear | null;
  bio: string;
  sports: { sport: SportId; skill: SkillLevel }[];
  gamesPlayed: number;
  gamesHosted: number;
  // Of ratedGames, how many they showed up to (late and left early count).
  attended: number;
  // Own profile only: every game that counts toward the score, newest first.
  // The app uses it to show how the score will recover (lib/reliability.ts).
  scoreEvents?: ScoreEvent[];
};

// One game that counts toward a reliability score: when it happened and how
// much credit it earned (1 = showed up, 0 = no-show; see MARK_CREDIT).
export type ScoreEvent = { at: string; credit: number };

// How the host marked a player. Late and left early earn partial credit.
export type AttendanceMark = "present" | "late" | "left_early" | "no_show";

// MVP1 has no waitlist: you're either in a game or not.
export type ParticipantStatus = "joined";

export type Participant = {
  user: MiniProfile;
  status: ParticipantStatus;
  joinedAt: string;
  confirmed: boolean;
  // null until attendance is settled (by the host, or by a player vote).
  // attended is false only for a no-show.
  mark: AttendanceMark | null;
  attended: boolean | null;
};

// Open while players vote on a game whose host didn't mark attendance in
// time. Votes are anonymous: the viewer sees their own votes and the totals.
export type AttendanceVote = {
  closesAt: string;
  // Players in the game, and how many of them have voted so far.
  voters: number;
  voted: number;
  // The viewer's votes so far, keyed by player id: true = showed up.
  mine: Record<string, boolean>;
  tally: Record<string, { yes: number; no: number }>;
};

export type GameStatus = "open" | "cancelled" | "completed";

export type Game = {
  id: string;
  sport: SportId;
  // Only set when sport is "other": what the host is actually playing.
  customSport: string;
  format: string;
  locationId: string;
  locationNote: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  minPlayers: number;
  skill: SkillLevel;
  // Lowest "shows up %" allowed to join. 0 = open to everyone.
  minReliability: number;
  notes: string;
  host: MiniProfile | null;
  // Rec Sports drop-in / open-rec slot rather than a student-posted game.
  isOfficial: boolean;
  visibility: "campus" | "friends";
  status: GameStatus;
  participants: Participant[];
  // Who settled attendance: the host, or the players by vote. null = not yet.
  attendanceBy: "host" | "vote" | null;
  attendanceVote: AttendanceVote | null;
};

export type NewGame = Pick<
  Game,
  "sport" | "customSport" | "format" | "locationId" | "locationNote" | "startsAt" | "durationMin" | "capacity" | "minPlayers" | "skill" | "minReliability" | "notes" | "visibility"
>;

export type FriendState = "none" | "friends" | "outgoing" | "incoming";

export type Friend = { user: Profile; state: Exclude<FriendState, "none"> };

// Group chat line. user is null for system lines ("Maya joined").
export type Message = { id: string; gameId: string; user: MiniProfile | null; body: string; createdAt: string };
