-- MVP1: soccer only, and reliability ("Shows up %") as the core feature.
--
--   * Reliability starts at 100 for everyone instead of being null for new
--     players. Each player is credited two free "showed up" games, so the
--     score is (attended + 2) / (attended + no-shows + 2): one early no-show
--     reads as 67%, not 0%. Mirrors lib/reliability.ts.
--   * Players expose ratedGames (marked games) so the app can still label
--     someone a "New player".
--   * Hosts can set a minimum reliability to join a game (0 = open to all).
--     join_game enforces it; new players (100%) always qualify.
--   * Only soccer games can be created. Existing rows are left alone.

-- ── Reliability ─────────────────────────────────────────────────────────

alter table public.profiles drop column reliability;
alter table public.profiles add column reliability integer generated always as (
  round((attended_count + 2) * 100.0 / (attended_count + no_show_count + 2))::integer
) stored;

-- MiniProfile
create or replace function public._mini_json(p_user_id uuid)
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
    'ratedGames', p.attended_count + p.no_show_count
  )
  from profiles p where p.id = p_user_id;
$$;

-- Profile
create or replace function public._profile_json(p_user_id uuid)
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
    'ratedGames', p.attended_count + p.no_show_count,
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

-- ── Minimum reliability per game ────────────────────────────────────────

alter table public.games add column min_reliability integer not null default 0
  check (min_reliability between 0 and 100);

-- Game
create or replace function public._game_json(g public.games)
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
    'minReliability', g.min_reliability,
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

-- ── Soccer only ─────────────────────────────────────────────────────────

-- NOT VALID: applies to new and edited games, not ones already in the table.
alter table public.games add constraint games_soccer_only check (sport_id = 'soccer') not valid;

-- None of the Rec Sports drop-ins are soccer; stop generating them and drop
-- any upcoming ones nobody joined.
update public.official_sessions set active = false where sport_id <> 'soccer';
delete from public.games g
where g.is_official and g.sport_id <> 'soccer' and g.starts_at > now()
  and not exists (select 1 from public.game_participants gp where gp.game_id = g.id);

delete from public.user_sports where sport_id <> 'soccer';
delete from public.sport_interests where sport_id <> 'soccer';

-- ── RPCs that change ────────────────────────────────────────────────────
-- create or replace keeps the grants/revokes from the earlier migrations.

-- p is the client's NewGame object (camelCase keys). sport is always soccer.
create or replace function public.create_game(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  v_id uuid;
begin
  if (p->>'startsAt')::timestamptz <= now() then
    raise exception 'Pick a start time in the future.';
  end if;
  -- Light abuse guard: nobody legitimately hosts this many at once.
  if (select count(*) from games where host_id = v_uid and status = 'open' and starts_at > now()) >= 10 then
    raise exception 'You already have 10 upcoming games posted.';
  end if;

  insert into games (host_id, sport_id, custom_sport, format, location_id, location_note, starts_at, duration_min, capacity, min_players, skill, min_reliability, notes, visibility)
  values (
    v_uid,
    'soccer',
    '',
    coalesce(nullif(p->>'format', ''), '5v5'),
    p->>'locationId',
    coalesce(p->>'locationNote', ''),
    (p->>'startsAt')::timestamptz,
    (p->>'durationMin')::integer,
    (p->>'capacity')::integer,
    least((p->>'minPlayers')::integer, (p->>'capacity')::integer),
    coalesce((p->>'skill')::skill_level, 'any'),
    coalesce((p->>'minReliability')::integer, 0),
    coalesce(p->>'notes', ''),
    coalesce((p->>'visibility')::game_visibility, 'campus')
  )
  returning id into v_id;

  -- The host is always player one, already confirmed.
  insert into game_participants (game_id, user_id, status, confirmed_at) values (v_id, v_uid, 'joined', now());
  return _game_json_by_id(v_id);
end;
$$;

-- Raising the minimum never removes players who already joined.
create or replace function public.update_game(p_game_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  g games;
  v_joined integer;
  v_new_start timestamptz := (p->>'startsAt')::timestamptz;
  v_moved boolean;
begin
  select * into g from games where id = p_game_id for update;
  if not found or g.host_id is distinct from v_uid then
    raise exception 'Only the host can edit this game.';
  end if;
  if g.status <> 'open' or g.starts_at <= now() then
    raise exception 'This game can no longer be edited.';
  end if;
  if v_new_start <= now() then
    raise exception 'Pick a start time in the future.';
  end if;

  select count(*) into v_joined from game_participants where game_id = p_game_id and status = 'joined';
  if (p->>'capacity')::integer < v_joined then
    raise exception '% players have already joined. Max players can''t be lower than that.', v_joined;
  end if;

  v_moved := g.starts_at <> v_new_start or g.location_id <> p->>'locationId';

  update games set
    sport_id = 'soccer',
    custom_sport = '',
    format = coalesce(nullif(p->>'format', ''), '5v5'),
    location_id = p->>'locationId',
    location_note = coalesce(p->>'locationNote', ''),
    starts_at = v_new_start,
    duration_min = (p->>'durationMin')::integer,
    capacity = (p->>'capacity')::integer,
    min_players = least((p->>'minPlayers')::integer, (p->>'capacity')::integer),
    skill = coalesce((p->>'skill')::skill_level, 'any'),
    min_reliability = coalesce((p->>'minReliability')::integer, 0),
    notes = coalesce(p->>'notes', ''),
    visibility = coalesce((p->>'visibility')::game_visibility, 'campus')
  where id = p_game_id;

  -- A new time or place voids earlier "I'll be there" confirmations.
  if v_moved then
    update game_participants set confirmed_at = null where game_id = p_game_id and user_id <> v_uid;
  end if;

  perform _system_message(p_game_id, case when v_moved
    then 'The host changed the time or place - check the details'
    else 'The host updated the game details' end);
  -- A bigger game may have room for people who were waiting.
  perform _promote_waitlist(p_game_id);
  return _game_json_by_id(p_game_id);
end;
$$;

create or replace function public.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  g games;
  v_joined integer;
  v_status participant_status;
  v_reliability integer;
begin
  select * into g from games where id = p_game_id for update;
  if not found or not _can_see_game(g, v_uid) then
    raise exception 'That game is no longer available.';
  end if;
  if g.status <> 'open' then
    raise exception 'This game was cancelled.';
  end if;
  if g.starts_at <= now() then
    raise exception 'This game has already started.';
  end if;

  if not _is_game_member(p_game_id, v_uid) then
    select reliability into v_reliability from profiles where id = v_uid;
    if v_reliability < g.min_reliability then
      raise exception '%', format('This game needs a reliability of %s%% or higher. You''re at %s%%.', g.min_reliability, v_reliability);
    end if;

    select count(*) into v_joined from game_participants where game_id = p_game_id and status = 'joined';
    v_status := case when v_joined < g.capacity then 'joined' else 'waitlist' end;
    insert into game_participants (game_id, user_id, status) values (p_game_id, v_uid, v_status);
    perform _system_message(p_game_id, _display_name(v_uid) || case when v_status = 'joined' then ' joined' else ' joined the waitlist' end);
  end if;

  update game_invites set status = 'accepted' where game_id = p_game_id and invitee_id = v_uid and status = 'pending';
  return _game_json_by_id(p_game_id);
end;
$$;

-- p: { name, classYear, bio, sports: [{ sport, skill }], onboarded }. Only
-- the soccer entry is kept.
create or replace function public.save_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if char_length(btrim(coalesce(p->>'name', ''))) < 2 then
    raise exception 'Please enter your name.';
  end if;

  update profiles set
    full_name = left(btrim(p->>'name'), 50),
    class_year = p->>'classYear',
    bio = left(coalesce(p->>'bio', ''), 160),
    -- One-way: editing a profile later must never un-onboard someone.
    onboarded = onboarded or coalesce((p->>'onboarded')::boolean, false)
  where id = v_uid;

  delete from user_sports where user_id = v_uid;
  insert into user_sports (user_id, sport_id, skill)
  select v_uid, s->>'sport', coalesce((s->>'skill')::skill_level, 'casual')
  from jsonb_array_elements(coalesce(p->'sports', '[]'::jsonb)) s
  where s->>'sport' = 'soccer'
  on conflict do nothing;
end;
$$;
