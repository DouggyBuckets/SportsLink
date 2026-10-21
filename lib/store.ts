import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO } from "@/lib/supabase";
import { AvailabilityBlock, Friend, Game, Message, MiniProfile, Profile, SportId } from "@/lib/types";

export type Invite = { gameId: string; from: MiniProfile };

type Data = {
  isAuthed: boolean;
  hasOnboarded: boolean;
  themeOverride: "system" | "light" | "dark";
  me: Profile | null;
  availability: AvailabilityBlock[];
  // Sports the viewer has switched "looking to play" on for.
  interests: SportId[];
  // Feed, the viewer's upcoming games and their recent history in one list;
  // screens derive their own slices (see lib/selectors.ts).
  games: Game[];
  // Group chat lines by game id. Demo mode keeps them here permanently; live
  // mode treats this as a cache in front of Supabase Realtime.
  messages: Record<string, Message[]>;
  friends: Friend[];
  invites: Invite[];
  blockedIds: string[];
  // Demo mode only: the day the mock feed was generated for.
  seedDay: string | null;
};

type AppState = Data & {
  patch: (partial: Partial<Data>) => void;
  upsertGame: (game: Game) => void;
  addMessages: (gameId: string, incoming: Message[]) => void;
  reset: () => void;
};

const initial: Data = {
  isAuthed: false,
  hasOnboarded: false,
  themeOverride: "system",
  me: null,
  availability: [],
  interests: [],
  games: [],
  messages: {},
  friends: [],
  invites: [],
  blockedIds: [],
  seedDay: null,
};

// The store is a dumb cache: every mutation goes through lib/api.ts, which
// talks to Supabase (or the demo world) and writes the result here.
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initial,
      patch: (partial) => set(partial),
      upsertGame: (game) =>
        set((s) => ({
          games: (s.games.some((g) => g.id === game.id) ? s.games.map((g) => (g.id === game.id ? game : g)) : [...s.games, game]).sort((a, b) =>
            a.startsAt.localeCompare(b.startsAt)
          ),
        })),
      // Idempotent by id: a sent message arrives twice in live mode, once from
      // the insert and once echoed back over Realtime.
      addMessages: (gameId, incoming) =>
        set((s) => {
          const existing = s.messages[gameId] ?? [];
          const seen = new Set(existing.map((m) => m.id));
          const merged = [...existing, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return { messages: { ...s.messages, [gameId]: merged } };
        }),
      reset: () => set((s) => ({ ...initial, themeOverride: s.themeOverride })),
    }),
    {
      // Demo and live keep separate copies so switching modes never mixes
      // fake games into a real account (or wipes the demo world).
      name: DEMO ? "sportslink-demo" : "sportslink",
      // Bump when bundled reference data (venues, formats) or the game shape
      // changes, so demo games generated against the old data are rebuilt.
      // Account, profile and free time carry over. v3: MVP1 - soccer only,
      // reliability always a number (new players start at 100). v4: no waitlist.
      // v5: profiles carry `attended`.
      version: 6,
      migrate: (persisted) => {
        const data = persisted as Data;
        const me = data.me
          ? { ...data.me, reliability: data.me.reliability ?? 100, ratedGames: data.me.ratedGames ?? 0, attended: data.me.attended ?? data.me.ratedGames ?? 0, sports: data.me.sports.filter((s) => s.sport === "soccer") }
          : null;
        return { ...data, me, interests: [], games: [], messages: {}, invites: [], friends: [], seedDay: null };
      },
      storage: createJSONStorage(() => AsyncStorage),
      // isAuthed is derived from the Supabase session on launch in live mode;
      // persisting it is what keeps a demo-mode user signed in.
      partialize: ({ patch, upsertGame, addMessages, reset, ...data }) => data,
    }
  )
);
