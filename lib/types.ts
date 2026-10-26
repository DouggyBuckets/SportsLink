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
  // Of ratedGames, how many they showed up to.
  attended: number;
};

// MVP1 has no waitlist: you're either in a game or not.
export type ParticipantStatus = "joined";

export type Participant = {
  user: MiniProfile;
  status: ParticipantStatus;
  joinedAt: string;
  confirmed: boolean;
  // null until the host marks attendance after the game.
  attended: boolean | null;
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
};

export type NewGame = Pick<
  Game,
  "sport" | "customSport" | "format" | "locationId" | "locationNote" | "startsAt" | "durationMin" | "capacity" | "minPlayers" | "skill" | "minReliability" | "notes" | "visibility"
>;

export type FriendState = "none" | "friends" | "outgoing" | "incoming";

export type Friend = { user: Profile; state: Exclude<FriendState, "none"> };

// Group chat line. user is null for system lines ("Maya joined").
export type Message = { id: string; gameId: string; user: MiniProfile | null; body: string; createdAt: string };
