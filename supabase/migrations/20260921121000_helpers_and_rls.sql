-- Shared helpers, the JSON shapes the client consumes, and row level security.
--
-- Functions prefixed with "_" are internal: they trust their arguments (they
-- take a user id rather than reading auth.uid()), so EXECUTE is revoked from
-- every client role at the bottom of each migration.

-- ── Helpers ─────────────────────────────────────────────────────────────

-- Caller's id, or a clean error for anonymous calls.
create function public._uid()
returns uuid
language plpgsql
stable
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'You need to be signed in.' using errcode = '28000';
  end if;
  return v;
end;
$$;

create function public._are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

-- Blocks are mutual in effect: either direction hides both people.
create function public._is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function public._is_game_member(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from game_participants where game_id = p_game_id and user_id = p_user_id);
$$;

create function public._can_see_game(g public.games, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (g.host_id is null or not _is_blocked(g.host_id, p_user_id))
    and (
      g.visibility = 'campus'
      or g.host_id = p_user_id
      or _is_game_member(g.id, p_user_id)
      or _are_friends(g.host_id, p_user_id)
      or exists (select 1 from game_invites i where i.game_id = g.id and i.invitee_id = p_user_id)
    );
$$;

-- Server-side twin of fitsSchedule() in lib/availability.ts: a game fits when
-- one free block covers it end to end, in campus local time.
create function public.game_fits_schedule(p_starts_at timestamptz, p_duration_min integer, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with local as (
    select
      extract(dow from p_starts_at at time zone 'America/Detroit')::int as dow,
      (extract(hour from p_starts_at at time zone 'America/Detroit') * 60
        + extract(minute from p_starts_at at time zone 'America/Detroit'))::int as start_min
  )
  select exists (
    select 1 from availability_blocks b, local
    where b.user_id = p_user_id
      and b.day_of_week = local.dow
      and b.start_min <= local.start_min
      and b.end_min >= local.start_min + p_duration_min
  );
$$;

create function public._system_message(p_game_id uuid, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into game_messages (game_id, user_id, body) values (p_game_id, null, p_body);
$$;

create function public._display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(full_name, ''), uniqname) from profiles where id = p_user_id;
$$;

-- Recomputed from source rows rather than incremented, so re-marking
-- attendance or replaying the cron job can never double count.
create function public._refresh_profile_stats(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles p set
    games_played = (
      select count(*) from game_participants gp join games g on g.id = gp.game_id
      where gp.user_id = p_user_id and gp.status = 'joined' and g.status = 'completed' and gp.attended is distinct from false
    ),
    games_hosted = (select count(*) from games g where g.host_id = p_user_id and g.status = 'completed'),
    attended_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.attended is true),
    no_show_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.attended is false)
  where p.id = p_user_id;
$$;

-- ── JSON shapes (must match lib/types.ts exactly) ───────────────────────

-- MiniProfile
create function public._mini_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', p.id, 'name', p.full_name, 'uniqname', p.uniqname, 'reliability', p.reliability)
  from profiles p where p.id = p_user_id;
$$;

-- Profile
create function public._profile_json(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.full_name,
    'uniqname', p.uniqname,
    'reliability', p.reliability,
    'classYear', p.class_year,
    'bio', p.bio,
    'gamesPlayed', p.games_played,
    'gamesHosted', p.games_hosted,
    'sports', coalesce((
      select jsonb_agg(jsonb_build_object('sport', us.sport_id, 'skill', us.skill) order by s.sort_order)
      from user_sports us join sports s on s.id = us.sport_id
      where us.user_id = p.id
    ), '[]'::jsonb)
  )
  from profiles p where p.id = p_user_id;
$$;

-- Game
create function public._game_json(g public.games)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'sport', g.sport_id,
    'customSport', g.custom_sport,
    'format', g.format,
    'locationId', g.location_id,
    'locationNote', g.location_note,
    'startsAt', g.starts_at,
    'durationMin', g.duration_min,
    'capacity', g.capacity,
    'minPlayers', g.min_players,
    'skill', g.skill,
    'notes', g.notes,
    'host', case when g.host_id is null then null else _mini_json(g.host_id) end,
    'isOfficial', g.is_official,
    'visibility', g.visibility,
    'status', g.status,
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user', _mini_json(gp.user_id),
        'status', gp.status,
        'joinedAt', gp.joined_at,
        'confirmed', gp.confirmed_at is not null,
        'attended', gp.attended
      ) order by gp.joined_at)
      from game_participants gp where gp.game_id = g.id
    ), '[]'::jsonb)
  );
$$;

create function public._game_json_by_id(p_game_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select _game_json(g) from games g where g.id = p_game_id;
$$;

-- Message
create function public._message_json(m public.game_messages)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', m.id,
    'gameId', m.game_id,
    'user', case when m.user_id is null then null else _mini_json(m.user_id) end,
    'body', m.body,
    'createdAt', m.created_at
  );
$$;

-- ── Row level security ──────────────────────────────────────────────────
-- RLS is on for every table, and almost none have policies: the app reads
-- and writes exclusively through SECURITY DEFINER RPCs, so direct table
-- access is simply closed. The exceptions are the ones that need it:
--   * reference data, which is public to signed-in students
--   * game_messages SELECT, because Supabase Realtime uses that policy to
--     decide who receives a chat insert
--   * push_tokens, which the client registers itself

alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.locations enable row level security;
alter table public.user_sports enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.sport_interests enable row level security;
alter table public.official_sessions enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;
alter table public.game_messages enable row level security;
alter table public.game_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.push_tokens enable row level security;

create policy "reference data is readable" on public.sports for select to authenticated using (true);
create policy "reference data is readable" on public.locations for select to authenticated using (true);
create policy "reference data is readable" on public.official_sessions for select to authenticated using (true);

create policy "chat is for members" on public.game_messages
  for select to authenticated using (_is_game_member(game_id, auth.uid()));

create policy "own push tokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Lock down internals ─────────────────────────────────────────────────
-- Several of these answer questions about arbitrary user ids (who blocked
-- whom, who is friends with whom), so they must not be callable as RPCs.

revoke execute on function
  public._uid(),
  public._are_friends(uuid, uuid),
  public._is_blocked(uuid, uuid),
  public._can_see_game(public.games, uuid),
  public.game_fits_schedule(timestamptz, integer, uuid),
  public._system_message(uuid, text),
  public._display_name(uuid),
  public._refresh_profile_stats(uuid),
  public._mini_json(uuid),
  public._profile_json(uuid),
  public._game_json(public.games),
  public._game_json_by_id(uuid),
  public._message_json(public.game_messages)
from public, anon, authenticated;

-- Evaluated inside the game_messages policy, which runs as the querying
-- role. Rosters are visible to students anyway, so this leaks nothing new.
revoke execute on function public._is_game_member(uuid, uuid) from public, anon;
