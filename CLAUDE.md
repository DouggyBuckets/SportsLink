# Sportslink

Mobile app for University of Michigan students to organize and join pickup soccer games. MVP 1. Team of 3 students: prefer simple, readable code over clever abstractions.

## Stack

- Expo SDK 57 (managed workflow), React Native 0.86, TypeScript, Expo Router
- Supabase: auth (email OTP), Postgres, row level security, Edge Functions, pg_cron
- `@supabase/supabase-js` with session storage in AsyncStorage (expo-secure-store caps values at 2048 bytes, too small for a session)
- Planned: expo-notifications, react-native-calendars, date-fns, @react-native-community/datetimepicker, jest-expo

## Expo changes fast — check the docs

Expo ships breaking changes every SDK. Before using an Expo, EAS, or React Native API, check the docs for the SDK in `package.json`: `https://docs.expo.dev/versions/v57.0.0/`. Index: https://docs.expo.dev/llms.txt.

## Commands

```bash
npm install
npx supabase start            # local Supabase in Docker (API :54321, Studio :54323, Mailpit :54324)
npx supabase status           # print local URL and keys
npx supabase db reset         # rebuild local DB from supabase/migrations
npx supabase migration new <name>
npx expo start                # dev server (press i / a, or scan with Expo Go)
npm run lint                  # expo lint (ESLint)
npm run typecheck             # tsc --noEmit
npx expo-doctor               # dependency / config check
npx expo install <package>    # always use this instead of npm install for app deps
```

Run lint and typecheck before every commit.

## Layout

- `src/app/` — Expo Router routes only. Every file is a screen; `_layout.tsx` files are navigators.
- `src/lib/` — Supabase client, pure logic (e.g. reliability score), helpers.
- `src/components/` — shared UI components.
- `supabase/migrations/` — SQL migrations, the source of truth for the schema and RLS.
- `supabase/functions/` — Edge Functions (Deno).
- Import app code with the `@/` alias (`@/lib/supabase`).

## Conventions

- Function components and hooks. Plain `StyleSheet.create`; no UI library.
- Times are stored as `timestamptz` and displayed in the device's local time.
- Keep screens simple: fetch with the Supabase client in the screen, no global state library.

## Security rules

- Every table has RLS enabled with explicit policies (`supabase/migrations/*_rls.sql`). New tables need RLS plus policies in the same migration.
- `game_players`, `attendance`, and `reliability_events` are read-only from the app. All writes go through `security definer` Postgres functions called with `supabase.rpc(...)`, which check permissions and lock rows.
- Only @umich.edu emails can sign up, enforced in the database, not just the app.
- Never store or select other users' emails (`profiles` has no email column) or push tokens.
- Only the publishable (anon) key goes in the app, via `EXPO_PUBLIC_SUPABASE_KEY`. The service role / secret key is only for Edge Function secrets.

## Workflow

- Ask before adding any dependency not listed above.
- Small diffs, one commit per feature step.
- Expo Go is enough for everything except remote push notifications, which need an EAS development build.
