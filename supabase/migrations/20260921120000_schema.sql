-- SportsLink core schema.
--
-- Conventions used across these migrations:
--   * Clients never touch tables directly. Every read and write goes through
--     a SECURITY DEFINER RPC (see the rpcs_* migrations) that checks
--     auth.uid(). That keeps capacity, waitlist, host hand-off and blocking
--     rules in one place where they can't be bypassed.
--   * All wall-clock logic (weekday, minutes past midnight) is evaluated in
--     America/Detroit, the campus timezone, never the server's.
--   * Day of week is 0 = Sunday, matching JS Date.getDay() and Postgres dow.

create type public.skill_level as enum ('any', 'casual', 'intermediate', 'competitive');
create type public.game_status as enum ('open', 'cancelled', 'completed');
create type public.game_visibility as enum ('campus', 'friends');
create type public.participant_status as enum ('joined', 'waitlist');
create type public.friendship_status as enum ('pending', 'accepted');
create type public.invite_status as enum ('pending', 'accepted', 'declined');

-- ── People ──────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  uniqname text not null unique,
  full_name text not null default '',
  class_year text check (class_year in ('Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad')),
  bio text not null default '' check (char_length(bio) <= 160),
  onboarded boolean not null default false,
  -- Denormalised by refresh_profile_stats(); never written by clients.
  games_played integer not null default 0,
  games_hosted integer not null default 0,
  attended_count integer not null default 0,
  no_show_count integer not null default 0,
  -- Percent of host-marked games the player showed up to. Null until there
  -- is any history, so new players aren't shown as 0% reliable.
  reliability integer generated always as (
    case when attended_count + no_show_count = 0 then null
         else round(attended_count * 100.0 / (attended_count + no_show_count))::integer end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_name_search on public.profiles (lower(full_name) text_pattern_ops);

-- ── Reference data ──────────────────────────────────────────────────────

-- Mirrors lib/sports.ts. Adding a row here makes a sport available without
-- an app release (the client falls back to a generic icon for unknown ids).
create table public.sports (
  id text primary key,
  name text not null,
  sf_symbol text not null,
  color text not null,
  formats text[] not null default '{}',
  default_capacity integer not null default 10,
  sort_order integer not null default 100
);

-- Mirrors lib/locations.ts.
create table public.locations (
  id text primary key,
  name text not null,
  area text not null check (area in ('Central', 'North', 'South', 'Hill')),
  address text not null default '',
  lat double precision,
  lng double precision,
  indoor boolean not null default false,
  sports text[] not null default '{}'
);

create table public.user_sports (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id) on delete cascade,
  skill public.skill_level not null default 'casual',
  primary key (user_id, sport_id)
);

-- ── Availability (the secret sauce) ─────────────────────────────────────

-- Weekly recurring free windows. The client always saves these merged (no
-- two blocks on a day touch or overlap), which is what lets "does this game
-- fit?" be a single-block containment check - see game_fits_schedule().
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 1 and 1440),
  check (end_min > start_min)
);

create index availability_blocks_user on public.availability_blocks (user_id, day_of_week);

-- "Looking to play": opt-in signal that feeds interest_overlap(). Expires so
-- the counts reflect people who want to play this week, not last semester.
create table public.sport_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (user_id, sport_id)
);

create index sport_interests_sport on public.sport_interests (sport_id, expires_at);

-- ── Games ───────────────────────────────────────────────────────────────

-- Recurring Rec Sports drop-in / open-rec slots. generate_official_games()
-- turns these into joinable games each night so the feed is never empty
-- (the cold-start answer).
create table public.official_sessions (
  id uuid primary key default gen_random_uuid(),
  sport_id text not null references public.sports (id),
  location_id text not null references public.locations (id),
  format text not null default 'Drop-in',
  location_note text not null default '',
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1439),
  duration_min integer not null default 120,
  capacity integer not null default 20,
  notes text not null default '',
  active boolean not null default true
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  -- Null for official sessions, or briefly if a host's account is deleted
  -- with nobody left to inherit (the game is cancelled in that case).
  host_id uuid references public.profiles (id) on delete set null,
  sport_id text not null references public.sports (id),
  -- Free-text name, only when sport_id = 'other'.
  custom_sport text not null default '' check (char_length(custom_sport) <= 30),
  format text not null default 'Pickup' check (char_length(format) <= 30),
  location_id text not null references public.locations (id),
  location_note text not null default '' check (char_length(location_note) <= 60),
  starts_at timestamptz not null,
  duration_min integer not null default 90 check (duration_min between 15 and 480),
  -- Max players, host included.
  capacity integer not null check (capacity between 2 and 40),
  -- "Game on" threshold.
  min_players integer not null check (min_players >= 2),
  skill public.skill_level not null default 'any',
  notes text not null default '' check (char_length(notes) <= 280),
  is_official boolean not null default false,
  official_session_id uuid references public.official_sessions (id) on delete set null,
  visibility public.game_visibility not null default 'campus',
  status public.game_status not null default 'open',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (min_players <= capacity),
  unique (official_session_id, starts_at)
);

create index games_feed on public.games (starts_at) where status = 'open';
create index games_host on public.games (host_id);

create table public.game_participants (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.participant_status not null default 'joined',
  -- Doubles as waitlist order and host-succession order.
  joined_at timestamptz not null default now(),
  -- "Still in?" confirmation in the 24h before kickoff.
  confirmed_at timestamptz,
  -- Set by the host after the game. Null = unmarked, which counts neither
  -- for nor against reliability.
  attended boolean,
  primary key (game_id, user_id)
);

create index game_participants_user on public.game_participants (user_id);

-- Group chat. One per game, implicitly: membership of the game is
-- membership of the chat. user_id null = system line ("Maya joined").
create table public.game_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index game_messages_game on public.game_messages (game_id, created_at);

create table public.game_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (game_id, invitee_id),
  check (inviter_id <> invitee_id)
);

create index game_invites_invitee on public.game_invites (invitee_id) where status = 'pending';

-- ── Social graph & safety ───────────────────────────────────────────────

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One row per pair regardless of who asked first.
create unique index friendships_pair on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked on public.blocks (blocked_id);

-- Reviewed by hand in the Supabase dashboard; no client can read these back.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  game_id uuid references public.games (id) on delete set null,
  reason text not null check (char_length(reason) <= 200),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Expo push tokens, for server-sent "spot opened up" / "game cancelled"
-- pushes. (The 2-hour "still in?" reminder is scheduled on-device.)
create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- ── Account lifecycle ───────────────────────────────────────────────────

-- The student check, enforced where it can't be skipped. The app only lets
-- you type a uniqname, but the Auth API is public, so the domain rule lives
-- here too. Proving ownership of the inbox is the emailed OTP.
create function public.enforce_umich_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is null or lower(new.email) !~ '^[a-z0-9._-]{2,}@umich\.edu$' then
    raise exception 'SportsLink is only open to @umich.edu email addresses.';
  end if;
  return new;
end;
$$;

create trigger enforce_umich_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_umich_email();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, uniqname)
  values (new.id, split_part(lower(new.email), '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
