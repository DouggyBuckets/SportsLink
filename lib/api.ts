import { dayKey } from "@/lib/dates";
import { buildGames, buildHistory, buildMyUpcoming, historyStats, ME_ID, mini, MOCK_USERS, mockUserById } from "@/lib/mock";
import { cancelGameReminder, scheduleGameReminder } from "@/lib/notifications";
import { isLateLeave, meetsMinimum, reliabilityScore } from "@/lib/reliability";
import { Invite, useAppStore } from "@/lib/store";
import { DEMO, supabase } from "@/lib/supabase";
import { AvailabilityBlock, ClassYear, Friend, FriendState, Game, Message, MiniProfile, NewGame, Participant, Profile, SkillLevel, SportId } from "@/lib/types";

// Single doorway for every read and write. Each function has a live path
// (Supabase RPCs, which return the same camelCase JSON as the client types -
// see supabase/migrations) and a demo path that mutates the local mock world.

export const UMICH_DOMAIN = "umich.edu";

const store = () => useAppStore.getState();
const db = () => supabase!;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const meMini = (): MiniProfile => mini(store().me!);

// ── Auth ────────────────────────────────────────────────────────────────

export const isUmichEmail = (email: string) => new RegExp(`^[a-z0-9._-]{2,}@${UMICH_DOMAIN.replace(".", "\\.")}$`).test(email.trim().toLowerCase());

export async function checkUserExists(email: string): Promise<boolean> {
  if (DEMO) return store().me?.uniqname === email.split("@")[0];
  try {
    return await rpc<boolean>("check_user_exists", { p_email: email });
  } catch {
    // Not knowing only changes the screen's copy, never the outcome.
    return false;
  }
}

export const MIN_PASSWORD_LENGTH = 8;

// MVP1 auth: umich.edu address + password, no email verification (the
// domain itself is still enforced by the `enforce_umich_email` trigger).
// Existing accounts sign in; new uniqnames get an account on the spot.
export async function signInOrSignUp(email: string, password: string, exists: boolean) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (DEMO) {
    const uniqname = email.split("@")[0];
    if (!exists) {
      store().reset();
      store().patch({ me: { id: ME_ID, name: "", uniqname, reliability: 100, ratedGames: 0, classYear: null, bio: "", sports: [], gamesPlayed: 0, gamesHosted: 0, attended: 0 } });
    }
    store().patch({ isAuthed: true });
    await loadAll();
    return;
  }
  const { error } = exists ? await db().auth.signInWithPassword({ email, password }) : await db().auth.signUp({ email, password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong password for that uniqname." : error.message);
  // onAuthStateChange in app/_layout.tsx flips isAuthed and calls loadAll.
}

// Signed-in users can change their password without email (MVP1 has no
// email sending, so there's no "forgot password" flow yet).
export async function changePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (DEMO) return;
  const { error } = await db().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!DEMO) await db().auth.signOut();
  store().patch({ isAuthed: false });
}

export async function deleteAccount() {
  if (!DEMO) {
    await rpc("delete_own_account");
    await db().auth.signOut();
  }
  store().reset();
}

// ── Bootstrap ───────────────────────────────────────────────────────────

type Bootstrap = {
  me: Profile & { onboarded: boolean };
  availability: AvailabilityBlock[];
  interests: SportId[];
  games: Game[];
  friends: Friend[];
  invites: Invite[];
  blockedIds: string[];
};

export async function loadAll() {
  if (DEMO) {
    const s = store();
    const today = dayKey(new Date());
    if (s.seedDay === today || !s.me) return;
    // New day: regenerate the rolling week. Games the viewer posted or joined
    // that are still upcoming are carried over so they don't vanish.
    const games = buildGames();
    const mine = s.games.filter((g) => g.status !== "completed" && new Date(g.startsAt) > new Date() && g.participants.some((p) => p.user.id === ME_ID));
    const firstRun = s.seedDay === null;
    // First run (or "Reset demo data"): the viewer gets a match history and
    // two upcoming games, with profile numbers to match.
    const me = firstRun ? { ...s.me, ...historyStats() } : s.me;
    const upcoming = firstRun ? buildMyUpcoming(mini(me)) : [];
    const seeded = [...games.filter((g) => !mine.some((m) => m.id === g.id)), ...mine, ...upcoming, ...buildHistory(mini(me))];
    s.patch({
      games: seeded.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      seedDay: today,
      me,
    });
    return;
  }
  const data = await rpc<Bootstrap>("bootstrap");
  const { onboarded, ...me } = data.me;
  store().patch({ ...data, me, hasOnboarded: onboarded });
}

// Demo only: rebuild the fake world relative to now (fresh history, a game
// kicking off in about an hour, scores back to their starting values).
// Keeps the viewer's name, level and free time.
export async function resetDemoData() {
  if (!DEMO) return;
  store().patch({ games: [], messages: {}, seedDay: null });
  await loadAll();
}

export async function refreshGames() {
  if (DEMO) return loadAll();
  store().patch({ games: await rpc<Game[]>("get_games") });
}

// ── Profile & availability ──────────────────────────────────────────────

export type ProfileInput = { name: string; classYear: ClassYear | null; bio: string; sports: { sport: SportId; skill: SkillLevel }[] };

export async function saveProfile(input: ProfileInput, opts: { finishOnboarding?: boolean } = {}) {
  if (!DEMO) await rpc("save_profile", { p: { ...input, onboarded: opts.finishOnboarding ?? false } });
  const me = { ...store().me!, ...input };
  // Rosters embed a copy of each player, so a rename has to reach them too.
  const games = store().games.map((g) => ({
    ...g,
    host: g.host?.id === me.id ? mini(me) : g.host,
    participants: g.participants.map((p) => (p.user.id === me.id ? { ...p, user: mini(me) } : p)),
  }));
  store().patch({ me, games, ...(opts.finishOnboarding ? { hasOnboarded: true } : {}) });
}

export async function saveAvailability(blocks: AvailabilityBlock[]) {
  if (!DEMO) await rpc("set_availability", { p_blocks: blocks });
  store().patch({ availability: blocks });
}

// ── Games ───────────────────────────────────────────────────────────────

const findGame = (id: string) => {
  const game = store().games.find((g) => g.id === id);
  if (!game) throw new Error("That game is no longer available.");
  return game;
};

const myIsJoined = (g: Game) => g.participants.some((p) => p.user.id === store().me?.id && p.status === "joined");

// Leaving or cancelling within LATE_LEAVE_HOURS of kickoff, with other
// players counting on you, is scored like a no-show.
function recordMissIfLate(g: Game) {
  const others = g.participants.some((p) => p.user.id !== ME_ID);
  const me = store().me;
  if (!me || !others || !isLateLeave(g)) return;
  const ratedGames = me.ratedGames + 1;
  store().patch({ me: { ...me, ratedGames, reliability: reliabilityScore(me.attended, ratedGames - me.attended) } });
}

const joinedCount = (g: Game) => g.participants.filter((p) => p.status === "joined").length;

// Games can require a minimum "shows up %" (enforced again in `join_game`).
// New players start at 100%, so they're never locked out of their first game.
export async function joinGame(id: string): Promise<Game> {
  let game: Game;
  if (DEMO) {
    const g = findGame(id);
    if (g.participants.some((p) => p.user.id === ME_ID)) return g;
    if (!meetsMinimum(store().me!, g.minReliability)) throw new Error(`This game needs a reliability of ${g.minReliability}% or higher.`);
    if (joinedCount(g) >= g.capacity) throw new Error("This game is full.");
    const spot: Participant = {
      user: meMini(),
      status: "joined",
      joinedAt: new Date().toISOString(),
      confirmed: false,
      attended: null,
    };
    game = { ...g, participants: [...g.participants, spot] };
    systemMessage(id, `${spot.user.name} joined`);
  } else {
    game = await rpc<Game>("join_game", { p_game_id: id });
  }
  store().upsertGame(game);
  store().patch({ invites: store().invites.filter((i) => i.gameId !== id) });
  scheduleGameReminder(game);
  return game;
}

// Leaving never strands the group: if the host is the one leaving, hosting
// passes to the player who joined earliest. Leaving late counts as a miss. Only a host leaving an otherwise empty game ends it.
// Mirrors `leave_game` in the SQL migrations.
export async function leaveGame(id: string): Promise<Game> {
  let game: Game;
  if (DEMO) {
    const g = findGame(id);
    recordMissIfLate(g);
    const participants = g.participants.filter((p) => p.user.id !== ME_ID);
    const byJoinTime = (a: Participant, b: Participant) => a.joinedAt.localeCompare(b.joinedAt);
    game = { ...g, participants };
    if (g.host?.id === ME_ID) {
      const heir = [...participants].sort(byJoinTime)[0];
      if (heir) {
        game = { ...game, host: heir.user };
        systemMessage(id, `${heir.user.name} is now hosting`);
      } else {
        game = { ...game, status: "cancelled" };
      }
    }
  } else {
    game = await rpc<Game>("leave_game", { p_game_id: id });
  }
  store().upsertGame(game);
  cancelGameReminder(id);
  return game;
}

export async function confirmSpot(id: string): Promise<Game> {
  const game = DEMO
    ? { ...findGame(id), participants: findGame(id).participants.map((p) => (p.user.id === ME_ID ? { ...p, confirmed: true } : p)) }
    : await rpc<Game>("confirm_spot", { p_game_id: id });
  store().upsertGame(game);
  return game;
}

export async function cancelGame(id: string): Promise<Game> {
  if (DEMO) recordMissIfLate(findGame(id));
  const game = DEMO ? { ...findGame(id), status: "cancelled" as const } : await rpc<Game>("cancel_game", { p_game_id: id });
  if (DEMO) systemMessage(id, "The host cancelled this game");
  store().upsertGame(game);
  cancelGameReminder(id);
  return game;
}

export async function postGame(input: NewGame): Promise<Game> {
  let game: Game;
  if (DEMO) {
    const host: Participant = { user: meMini(), status: "joined", joinedAt: new Date().toISOString(), confirmed: true, attended: null };
    game = { ...input, id: `mine-${Date.now()}`, host: meMini(), isOfficial: false, status: "open", participants: [host] };
    store().patch({ me: { ...store().me!, gamesHosted: store().me!.gamesHosted + 1 } });
  } else {
    game = await rpc<Game>("create_game", { p: input });
  }
  store().upsertGame(game);
  scheduleGameReminder(game);
  return game;
}

// Host-only. Capacity can't drop below the players already in (enforced again
// server-side); everyone in the chat is told what changed.
export async function updateGame(id: string, input: NewGame): Promise<Game> {
  let game: Game;
  if (DEMO) {
    const g = findGame(id);
    const joined = joinedCount(g);
    if (input.capacity < joined) throw new Error(`${joined} players have already joined. Max players can't be lower than that.`);
    game = { ...g, ...input };
    const moved = g.startsAt !== input.startsAt || g.locationId !== input.locationId;
    systemMessage(id, moved ? "The host changed the time or place - check the details" : "The host updated the game details");
  } else {
    game = await rpc<Game>("update_game", { p_game_id: id, p: input });
  }
  store().upsertGame(game);
  if (myIsJoined(game)) {
    await cancelGameReminder(id);
    scheduleGameReminder(game);
  }
  return game;
}

// Host-only, after kickoff. Everyone joined who isn't in `attendedIds` is
// recorded as a no-show, which is what feeds reliability scores.
export async function markAttendance(id: string, attendedIds: string[]): Promise<Game> {
  let game: Game;
  if (DEMO) {
    const g = findGame(id);
    game = {
      ...g,
      status: "completed",
      participants: g.participants.map((p) => (p.status === "joined" ? { ...p, attended: attendedIds.includes(p.user.id) } : p)),
    };
  } else {
    game = await rpc<Game>("mark_attendance", { p_game_id: id, p_attended: attendedIds });
  }
  store().upsertGame(game);
  return game;
}

export async function inviteFriends(gameId: string, friendIds: string[]) {
  if (DEMO || friendIds.length === 0) return;
  await rpc("invite_friends", { p_game_id: gameId, p_invitee_ids: friendIds });
}

export async function declineInvite(gameId: string) {
  if (!DEMO) await rpc("decline_invite", { p_game_id: gameId });
  store().patch({ invites: store().invites.filter((i) => i.gameId !== gameId) });
}

// ── Group chat ──────────────────────────────────────────────────────────
// Every game has one; anyone on the roster can read and post.
// There is nothing to "create" on join - access simply follows membership
// (enforced by RLS on game_messages), so leaving the game leaves the chat.

let localId = 0;
const newLocalId = () => `local-${Date.now()}-${++localId}`;

function systemMessage(gameId: string, body: string) {
  store().addMessages(gameId, [{ id: newLocalId(), gameId, user: null, body, createdAt: new Date().toISOString() }]);
}

const DEMO_OPENERS = ["Anyone have a ball / pinnies?", "I can bring one. See everyone there", "Running ~5 min late, start without me"];

export async function fetchMessages(gameId: string) {
  if (!DEMO) {
    store().addMessages(gameId, await rpc<Message[]>("get_messages", { p_game_id: gameId }));
    return;
  }
  // Seed a little life into chats the viewer has never opened.
  if (store().messages[gameId]?.some((m) => m.user && m.user.id !== ME_ID)) return;
  const others = findGame(gameId).participants.filter((p) => p.user.id !== ME_ID).slice(0, DEMO_OPENERS.length);
  store().addMessages(
    gameId,
    others.map((p, i) => ({ id: `seed-${gameId}-${i}`, gameId, user: p.user, body: DEMO_OPENERS[i], createdAt: new Date(Date.now() - (others.length - i) * 40 * 60_000).toISOString() }))
  );
}

export async function sendMessage(gameId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const message = DEMO
    ? { id: newLocalId(), gameId, user: meMini(), body: text, createdAt: new Date().toISOString() }
    : await rpc<Message>("send_message", { p_game_id: gameId, p_body: text });
  store().addMessages(gameId, [message]);
}

// Live updates while a chat is open. Realtime rows arrive without the
// sender's profile, so the sender is resolved from the roster we already hold.
export function subscribeToMessages(gameId: string): () => void {
  if (DEMO) return () => {};
  const channel = db()
    .channel(`game-chat-${gameId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_messages", filter: `game_id=eq.${gameId}` }, (payload) => {
      const row = payload.new as { id: string; user_id: string | null; body: string; created_at: string };
      const roster = store().games.find((g) => g.id === gameId)?.participants ?? [];
      const user = row.user_id ? (roster.find((p) => p.user.id === row.user_id)?.user ?? { id: row.user_id, name: "Player", uniqname: "", reliability: 100, ratedGames: 0 }) : null;
      store().addMessages(gameId, [{ id: row.id, gameId, user, body: row.body, createdAt: row.created_at }]);
      // Roster-changing system lines mean our copy of the game is stale.
      if (!row.user_id) refreshGames().catch(() => {});
    })
    .subscribe();
  return () => {
    db().removeChannel(channel);
  };
}

// ── Friends & safety ────────────────────────────────────────────────────

export const friendState = (friends: Friend[], id: string): FriendState => friends.find((f) => f.user.id === id)?.state ?? "none";

export async function searchPeople(query: string): Promise<Profile[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  if (!DEMO) return rpc<Profile[]>("search_people", { p_query: q });
  const { blockedIds } = store();
  return MOCK_USERS.filter((u) => !blockedIds.includes(u.id) && (u.name.toLowerCase().includes(q) || u.uniqname.includes(q))).slice(0, 20);
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  if (id === store().me?.id) return store().me;
  if (!DEMO) return rpc<Profile | null>("get_profile", { p_user_id: id });
  return mockUserById(id) ?? null;
}

async function syncFriends(demo: (friends: Friend[]) => Friend[]) {
  store().patch({ friends: DEMO ? demo(store().friends) : await rpc<Friend[]>("get_friends") });
}

export async function requestFriend(user: Profile) {
  if (!DEMO) await rpc("request_friend", { p_user_id: user.id });
  await syncFriends((f) => [...f.filter((x) => x.user.id !== user.id), { user, state: "outgoing" }]);
}

export async function respondToFriend(id: string, accept: boolean) {
  if (!DEMO) await rpc("respond_friend", { p_user_id: id, p_accept: accept });
  await syncFriends((f) => (accept ? f.map((x) => (x.user.id === id ? { ...x, state: "friends" as const } : x)) : f.filter((x) => x.user.id !== id)));
}

export async function removeFriend(id: string) {
  if (!DEMO) await rpc("remove_friend", { p_user_id: id });
  await syncFriends((f) => f.filter((x) => x.user.id !== id));
}

// Blocking is mutual and silent: it unfriends, and hides each person's games
// and profile from the other.
export async function blockUser(id: string) {
  if (!DEMO) await rpc("block_user", { p_user_id: id });
  const s = store();
  s.patch({
    blockedIds: [...s.blockedIds, id],
    friends: s.friends.filter((f) => f.user.id !== id),
    games: s.games.filter((g) => g.host?.id !== id),
  });
}

export async function reportUser(id: string, reason: string, gameId?: string) {
  if (DEMO) return;
  await rpc("report_user", { p_user_id: id, p_reason: reason, p_game_id: gameId ?? null });
}
