-- Sportslink core schema.
-- Emails live only in auth.users and are never copied into public tables.

-- Profiles: one row per user, created by the user during onboarding.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  position text check (position in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  skill_level text check (skill_level in ('casual', 'intermediate', 'competitive')),
  created_at timestamptz not null default now()
);

-- Expo push tokens. A token belongs to one user at a time (the device's current user).
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (char_length(trim(location)) between 1 and 200),
  max_players int not null check (max_players between 2 and 50),
  notes text check (char_length(notes) <= 1000),
  status text not null default 'open' check (status in ('open', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index games_starts_at_idx on public.games (starts_at);

-- One row per user per game; status changes over time instead of adding rows.
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('joined', 'waitlisted', 'left', 'removed')),
  joined_at timestamptz,        -- when the player got a spot (join or waitlist promotion)
  waitlisted_at timestamptz,    -- waitlist order
  left_at timestamptz,
  confirmed_at timestamptz,     -- answered "still in?" with yes
  reminder_sent_at timestamptz, -- prevents duplicate reminders
  unique (game_id, user_id)
);

create index game_players_user_id_idx on public.game_players (user_id);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  user_id uuid not null,
  outcome text not null check (outcome in ('present', 'late', 'no_show')),
  marked_by uuid not null references public.profiles (id),
  marked_at timestamptz not null default now(),
  unique (game_id, user_id),
  foreign key (game_id, user_id) references public.game_players (game_id, user_id) on delete cascade
);

-- Append-only log the reliability score is computed from (see src/lib/reliability.ts).
-- Written only by database functions and triggers, never by the app.
create table public.reliability_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  event_type text not null check (
    event_type in ('joined_game', 'left_game', 'attended_on_time', 'attended_late', 'no_show')
  ),
  -- Only set for left_game, so the scoring function decides the penalty bands.
  hours_before_start numeric(7, 2),
  created_at timestamptz not null default now(),
  check ((event_type = 'left_game') = (hours_before_start is not null))
);

create index reliability_events_user_id_idx on public.reliability_events (user_id);
