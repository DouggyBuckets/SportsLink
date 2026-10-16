# SportsLink

Pickup soccer for U-M students, matched to your free time, with a reliability score so games actually happen. MVP1 is soccer only. Expo (SDK 57) + expo-router + Supabase.

## Run it

```sh
npm install
npx expo start --go --ios     # Expo Go on the simulator
```

With no `.env`, the app runs in **demo mode**: two generated weeks of soccer games, fake students, and group chats, all stored on-device. Sign in with any uniqname and any password of 8+ characters.

## Connect Supabase

1. Create a project, then `supabase link --project-ref <ref>` and `supabase db push` (applies everything in `supabase/migrations`).
2. Auth is umich.edu email + password with no email verification (MVP1). `supabase config push` applies the auth settings in `config.toml` (email confirmations off, 8+ character passwords). The `enforce_umich_email` trigger still rejects other domains.
3. Dashboard → Database → Extensions: enable `pg_cron` (the last migration schedules three jobs).
4. Copy `.env.example` to `.env` and fill in the URL and anon key. Restart Metro.


## How it fits together

| Path | What lives there |
| --- | --- |
| `app/` | Screens. `(auth)` → `onboarding` → `(tabs)`, gated in `app/_layout.tsx`. Tabs: Games (feed), My schedule (the free-time grid, auto-saved), Profile (reliability, upcoming and past games). Modals: `game/[id]` (details + group chat), `post-game` (create + edit), `attendance/[id]` (host marks who showed), `user/[id]`. |
| `lib/api.ts` | The only doorway for reads/writes. Every function has a Supabase path and a demo path. |
| `lib/availability.ts` | The matching logic (`fitsSchedule`). Mirrored in SQL by `game_fits_schedule`. |
| `lib/reliability.ts` | The reliability formula, labels and late-leave window. Mirrored by the `reliability` column on `profiles`. |
| `lib/sports.ts`, `lib/locations.ts` | Bundled copies of the `sports` / `locations` tables. After editing either, run `python3 scripts/gen-seed.py` to regenerate the seed migration. |
| `supabase/migrations/` | Schema, RLS, RPCs, seeds, cron. Clients never touch tables: all access is via RPCs that return the same JSON shapes as `lib/types.ts`. |

## Product rules worth knowing

- **Student check** = `@umich.edu` only (enforced by a trigger on `auth.users`). MVP1 uses a password with no inbox verification, so anyone could claim an unused uniqname - add email codes (needs custom SMTP) before a wider launch.
- **No waitlist in MVP1**: a full game can't be joined. **Leaving never strands a game**: if the host leaves, the earliest-joined player becomes host. Only *Cancel game* ends it for everyone.
- **Group chat** follows membership: join to get it, leave to lose it. Purged 14 days after the game.
- **Reliability score**: everyone starts at 100%. After a game the host marks who showed; the score is (attended + 2) / (counted games + 2), so one early miss reads 67%, not 0%. Players with no counted games show as "New player". Hosts can require a minimum (70/80/90%) to join, enforced in `join_game`.
- **Leaving late counts as a miss**: leaving (or cancelling as host) within 2 hours of kickoff while others are in is scored like a no-show (`late_leaves` table). Earlier than that is free; rejoining clears it.
- **Players**: hosts set how many are needed to play ("Game on" threshold, defaults to both full sides) plus sub spots on top.
- **Finished games are kept**, not deleted - they feed profile stats and reliability. Cancelled games purge after 30 days.
- **Not in MVP1** (backend kept, UI removed): other sports, friends and invites, friends-only games, "looking to play" matching.
- **Schedules are private.** Other users only ever get a yes/no ("fits") or a count ("6 players free Tue 5-7pm").
