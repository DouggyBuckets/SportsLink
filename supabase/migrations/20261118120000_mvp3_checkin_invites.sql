-- MVP3, from Preso #4 user testing ("shortcomings and solutions"):
--
--   * Location check-in. From an hour before kickoff to an hour after, a
--     player at the field can check in from the app. It counts as showing
--     up straight away, and the host's marks and the player vote can't
--     override it. Only for listed fields (they have coordinates), within
--     CHECK_IN_RADIUS_M of the field.
--   * Host invites. The host can invite anyone to their game, and an
--     invited player can join even if they're below the game's minimum.
--   * The presentation seed puts the viewer's next game 45 minutes out (so
--     check-in is open) and gives them a host invite to an 80%+ game.
--
-- Mirrors lib/checkin.ts (CHECK_IN_*).

-- ── Check-in ────────────────────────────────────────────────────────────

alter table public.game_participants add column checked_in_at timestamptz;

-- Great-circle distance in meters.
create function public._distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create function public.check_in(p_game_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  g games;
  l locations;
  v_dist double precision;
begin
  select * into g from games where id = p_game_id for update;
  if not found or not _is_game_member(p_game_id, v_uid) then
    raise exception 'Only players in this game can check in.';
  end if;
  if g.status = 'cancelled' then
    raise exception 'This game was cancelled.';
  end if;
  if now() < g.starts_at - interval '1 hour' then
    raise exception 'Check-in opens an hour before kickoff.';
  end if;
  if now() > g.starts_at + interval '1 hour' then
    raise exception 'Check-in closed an hour after kickoff. The host marks attendance instead.';
  end if;
  select * into l from locations where id = g.location_id;
  if not found or g.location_id = 'other' or l.lat is null then
    raise exception 'Check-in only works at listed fields. The host marks attendance for this game.';
  end if;
  v_dist := _distance_m(p_lat, p_lng, l.lat, l.lng);
  if v_dist > 250 then
    raise exception '%', format('You''re about %s from %s. Check in once you''re at the field.',
      case when v_dist >= 1000 then round((v_dist / 1000)::numeric, 1) || ' km' else round(v_dist) || ' m' end, l.name);
  end if;

  update game_participants set checked_in_at = coalesce(checked_in_at, now()), mark = 'present', attended = true
  where game_id = p_game_id and user_id = v_uid;
  perform _refresh_profile_stats(v_uid);
  return _game_json_by_id(p_game_id);
end;
$$;

-- Checked-in players stay present whatever the host marks.
create or replace function public.mark_attendance(p_game_id uuid, p_marks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g games;
  v_user uuid;
begin
  select * into g from games where id = p_game_id for update;
  if not found or g.host_id is distinct from _uid() then
    raise exception 'Only the host can mark attendance.';
  end if;
  if g.status = 'cancelled' or g.starts_at > now() then
    raise exception 'Attendance can be marked once the game has started.';
  end if;
  if g.attendance_by = 'vote' then
    raise exception 'The players already settled attendance for this game.';
  end if;
  if now() > _game_end(g) + interval '24 hours' then
    raise exception 'Hosts have 24 hours after the game to mark attendance. The players vote on it instead.';
  end if;

  update game_participants gp set
    mark = m.mark,
    attended = m.mark <> 'no_show'
  from (
    select gp2.user_id,
      case when gp2.checked_in_at is not null then 'present'::attendance_mark else coalesce(
        (p_marks->>gp2.user_id::text)::attendance_mark,
        case when gp2.user_id = g.host_id then 'present' else 'no_show' end::attendance_mark
      ) end as mark
    from game_participants gp2 where gp2.game_id = p_game_id
  ) m
  where gp.game_id = p_game_id and gp.user_id = m.user_id;

  update games set
    status = case when status = 'open' then 'completed'::game_status else status end,
    attendance_by = 'host'
  where id = p_game_id;

  for v_user in select user_id from game_participants where game_id = p_game_id loop
    perform _refresh_profile_stats(v_user);
  end loop;
  return _game_json_by_id(p_game_id);
end;
$$;

-- Checked-in players aren't voted on.
create or replace function public._settle_attendance_vote(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  update game_participants gp set
    mark = case when t.yes_votes >= t.no_votes then 'present' else 'no_show' end::attendance_mark,
    attended = t.yes_votes >= t.no_votes
  from (
    select player_id, count(*) filter (where showed) as yes_votes, count(*) filter (where not showed) as no_votes
    from attendance_votes where game_id = p_game_id group by player_id
  ) t
  where gp.game_id = p_game_id and gp.user_id = t.player_id and gp.checked_in_at is null;

  update games set
    status = case when status = 'open' then 'completed'::game_status else status end,
    attendance_by = 'vote'
  where id = p_game_id;

  for v_user in select user_id from game_participants where game_id = p_game_id loop
    perform _refresh_profile_stats(v_user);
  end loop;
end;
$$;

create or replace function public.vote_attendance(p_game_id uuid, p_votes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if not found or not _is_game_member(p_game_id, v_uid) then
    raise exception 'Only players in this game can vote.';
  end if;
  if g.status = 'cancelled' or g.attendance_by is not null then
    raise exception 'Attendance for this game is already settled.';
  end if;
  if now() < _game_end(g) + interval '24 hours' then
    raise exception 'The host has 24 hours after the game to mark attendance first.';
  end if;
  if now() >= _game_end(g) + interval '72 hours' then
    raise exception 'Voting on this game has closed.';
  end if;

  insert into attendance_votes (game_id, voter_id, player_id, showed)
  select p_game_id, v_uid, gp.user_id, (p_votes->>gp.user_id::text)::boolean
  from game_participants gp
  where gp.game_id = p_game_id and gp.user_id <> v_uid and gp.checked_in_at is null and p_votes ? gp.user_id::text
  on conflict (game_id, voter_id, player_id) do update set showed = excluded.showed, created_at = now();

  if (select count(distinct voter_id) from attendance_votes where game_id = p_game_id)
     >= (select count(*) from game_participants where game_id = p_game_id) then
    perform _settle_attendance_vote(p_game_id);
  end if;
  return _game_json_by_id(p_game_id);
end;
$$;

-- ── Host invites ────────────────────────────────────────────────────────

alter table public.game_invites add column from_host boolean not null default false;

-- Host-only. Anyone (not blocked) can be invited; invited players can join
-- below the game's minimum reliability.
create function public.invite_players(p_game_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  g games;
begin
  select * into g from games where id = p_game_id;
  if not found or g.host_id is distinct from v_uid then
    raise exception 'Only the host can invite players.';
  end if;
  if g.status <> 'open' or g.starts_at <= now() then
    raise exception 'This game has already started.';
  end if;
  insert into game_invites (game_id, inviter_id, invitee_id, from_host)
  select p_game_id, v_uid, u, true
  from unnest(p_user_ids) u
  where u <> v_uid and not _is_blocked(u, v_uid) and not _is_game_member(p_game_id, u)
    and exists (select 1 from profiles p where p.id = u)
  on conflict (game_id, invitee_id) do update set inviter_id = v_uid, from_host = true, status = 'pending', created_at = now();
  return _game_json_by_id(p_game_id);
end;
$$;

create function public.uninvite_player(p_game_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from games where id = p_game_id and host_id = _uid()) then
    raise exception 'Only the host can change invites.';
  end if;
  delete from game_invites where game_id = p_game_id and invitee_id = p_user_id and from_host and status = 'pending';
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
    -- A host's invite lets a player in below the minimum.
    if v_reliability < g.min_reliability
       and not exists (select 1 from game_invites i where i.game_id = p_game_id and i.invitee_id = v_uid and i.from_host) then
      raise exception '%', format('This game needs a reliability of %s%% or higher. You''re at %s%%.', g.min_reliability, v_reliability);
    end if;

    -- The row lock above serialises joins, so two people can't take the
    -- last spot.
    select count(*) into v_joined from game_participants where game_id = p_game_id;
    if v_joined >= g.capacity then
      raise exception 'This game is full.';
    end if;

    insert into game_participants (game_id, user_id, status) values (p_game_id, v_uid, 'joined');
    perform _system_message(p_game_id, _display_name(v_uid) || ' joined');

    delete from late_leaves where game_id = p_game_id and user_id = v_uid;
    if found then
      perform _refresh_profile_stats(v_uid);
    end if;
  end if;

  update game_invites set status = 'accepted' where game_id = p_game_id and invitee_id = v_uid and status = 'pending';
  return _game_json_by_id(p_game_id);
end;
$$;

-- ── JSON ────────────────────────────────────────────────────────────────

-- Participants gain `checkedInAt`; games gain `invitedMe` and (for the
-- host) `invited`.
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
        'mark', gp.mark,
        'attended', gp.attended,
        'checkedInAt', gp.checked_in_at
      ) order by gp.joined_at)
      from game_participants gp where gp.game_id = g.id
    ), '[]'::jsonb),
    'attendanceBy', g.attendance_by,
    -- The viewer was invited by the host, so the minimum doesn't apply.
    'invitedMe', exists (
      select 1 from game_invites i where i.game_id = g.id and i.invitee_id = _uid() and i.from_host and i.status <> 'declined'
    ),
    -- Host only: who they've invited that hasn't joined yet.
    'invited', case when g.host_id = _uid() then coalesce((
      select jsonb_agg(_mini_json(i.invitee_id) order by i.created_at)
      from game_invites i
      where i.game_id = g.id and i.from_host and i.status = 'pending' and not _is_game_member(g.id, i.invitee_id)
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attendanceVote', case
      when g.attendance_by is null and g.status <> 'cancelled'
        and now() >= _game_end(g) + interval '24 hours'
        and now() < _game_end(g) + interval '72 hours'
        and _is_game_member(g.id, _uid())
      then jsonb_build_object(
        'closesAt', _game_end(g) + interval '72 hours',
        'voters', (select count(*) from game_participants where game_id = g.id),
        'voted', (select count(distinct voter_id) from attendance_votes where game_id = g.id),
        'mine', coalesce((
          select jsonb_object_agg(player_id, showed) from attendance_votes where game_id = g.id and voter_id = _uid()
        ), '{}'::jsonb),
        'tally', coalesce((
          select jsonb_object_agg(player_id, jsonb_build_object('yes', yes_votes, 'no', no_votes))
          from (
            select player_id, count(*) filter (where showed) as yes_votes, count(*) filter (where not showed) as no_votes
            from attendance_votes where game_id = g.id group by player_id
          ) t
        ), '{}'::jsonb)
      )
    end
  );
$$;

-- ── Presentation seed ───────────────────────────────────────────────────

create or replace function public.seed_presentation_data(p_viewer_uniqname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_viewer uuid;
  v_names text[] := array[
    'Alex Chen', 'Maya Patel', 'Jordan Williams', 'Sofia Rodriguez', 'Ethan Kim', 'Priya Shah', 'Marcus Johnson', 'Hannah Becker',
    'Diego Alvarez', 'Emma Novak', 'Tyler Brooks', 'Aisha Rahman', 'Noah Goldberg', 'Grace Liu', 'Owen Murphy', 'Zoe Washington',
    'Lucas Meyer', 'Nina Kowalski', 'Caleb Turner', 'Isabel Tran', 'Ravi Gupta', 'Chloe Anderson', 'Sam Okafor', 'Leah Friedman'];
  v_years text[] := array['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad'];
  v_skills skill_level[] := array['casual', 'intermediate', 'intermediate', 'competitive'];
  v_formats text[] := array['5v5', '7v7', '7v7', '11v11'];
  v_notes text[] := array['Bring a light and dark shirt.', 'Casual game, all welcome. We have a ball and cones.', 'Looking for a couple more to round out teams.', 'We play every week - come through!', 'Turf, so cleats or turf shoes.', '', ''];
  v_slots int[] := array[12*60, 15*60+30, 16*60+30, 17*60, 17*60+30, 18*60+30, 19*60, 20*60];
  v_locs text[];
  v_fakes uuid[] := '{}';
  v_flaky uuid[] := '{}';
  v_id uuid;
  v_game uuid;
  v_host uuid;
  v_start timestamptz;
  v_format text;
  v_cap int;
  v_full int;
  v_join int;
  v_min int;
  v_day int;
  v_count int := 0;
  i int;
  r record;
begin
  select id into v_viewer from profiles where uniqname = p_viewer_uniqname;
  if v_viewer is null then
    raise exception 'No SportsLink account with uniqname %', p_viewer_uniqname;
  end if;
  perform setseed(0.441);

  -- ── Wipe the previous run ─────────────────────────────────────────────
  delete from games where id in (select game_id from demo_seed_games);
  delete from auth.users where email like '%.demo@umich.edu';

  select array_agg(id order by id) into v_locs from locations where 'soccer' = any (sports) and id <> 'other';

  -- ── Fake students ─────────────────────────────────────────────────────
  for i in 1 .. array_length(v_names, 1) loop
    insert into auth.users (id, email)
    values (gen_random_uuid(), lower(left(split_part(v_names[i], ' ', 1), 1) || split_part(v_names[i], ' ', 2)) || '.demo@umich.edu')
    returning id into v_id;
    update profiles set full_name = v_names[i], class_year = v_years[1 + (i % 5)], onboarded = true where id = v_id;
    insert into user_sports (user_id, sport_id, skill) values (v_id, 'soccer', v_skills[1 + (i % 4)]);
    -- Free most weekday evenings plus a weekend afternoon.
    insert into availability_blocks (user_id, day_of_week, start_min, end_min)
    select v_id, d, (15 + (i + d) % 3) * 60, (20 + (i + d) % 3) * 60 from generate_series(1, 5) d where (i + d) % 4 <> 0
    union all select v_id, 6, 600, 1080
    union all select v_id, 0, 720, 1200 where i % 2 = 0;
    v_fakes := v_fakes || v_id;
    if i % 9 = 5 then v_flaky := v_flaky || v_id; end if;
  end loop;

  -- ── A month of finished games among them, for their scores ────────────
  for v_day in 3 .. 33 by 2 loop
    v_host := v_fakes[1 + floor(random() * 24)::int];
    v_start := date_trunc('day', now() at time zone 'America/Detroit') at time zone 'America/Detroit' - make_interval(days => v_day) + interval '17 hours';
    insert into games (host_id, sport_id, format, location_id, starts_at, duration_min, capacity, min_players, status, attendance_by)
    values (v_host, 'soccer', '7v7', v_locs[1 + floor(random() * array_length(v_locs, 1))::int], v_start, 90, 16, 14, 'completed', 'host')
    returning id into v_game;
    insert into demo_seed_games values (v_game);
    insert into game_participants (game_id, user_id, status, joined_at, confirmed_at, mark, attended)
    select v_game, u, 'joined', v_start - interval '1 day', v_start - interval '2 hours', m, m <> 'no_show'
    from (
      select u,
        case
          when u = v_host then 'present'
          when u = any (v_flaky) and random() < 0.4 then 'no_show'
          when random() < 0.06 then 'no_show'
          when random() < 0.08 then 'late'
          else 'present'
        end::attendance_mark as m
      from (select u from unnest(v_fakes) u where u <> v_host order by random() limit 13) pick
      union all select v_host, 'present'
    ) x;
  end loop;
  -- A few genuinely new players: no history at all.
  delete from game_participants gp using demo_seed_games d
  where gp.game_id = d.game_id and gp.user_id in (v_fakes[4], v_fakes[11], v_fakes[18]) and gp.user_id is distinct from (select host_id from games where id = gp.game_id);

  -- A host invites the viewer to a game whose minimum they're below, to
  -- show that a host's invite lets them in anyway.
  insert into game_invites (game_id, inviter_id, invitee_id, from_host)
  select g.id, g.host_id, v_viewer, true
  from games g join demo_seed_games d on d.game_id = g.id
  where g.min_reliability >= 80 and g.starts_at > now() + interval '1 day' and g.host_id <> v_viewer
    and not exists (select 1 from game_participants gp where gp.game_id = g.id and gp.user_id = v_viewer)
    and (select count(*) from game_participants gp where gp.game_id = g.id) < g.capacity
  order by g.starts_at
  limit 1;

  for i in 1 .. 24 loop
    perform _refresh_profile_stats(v_fakes[i]);
  end loop;

  -- ── Two weeks of upcoming games ───────────────────────────────────────
  for v_day in 0 .. 13 loop
    for i in 1 .. 3 + floor(random() * 3)::int loop
      v_start := date_trunc('day', now() at time zone 'America/Detroit') at time zone 'America/Detroit'
        + make_interval(days => v_day, mins => v_slots[1 + floor(random() * array_length(v_slots, 1))::int]);
      continue when v_start < now() + interval '45 minutes';
      v_format := v_formats[1 + floor(random() * 4)::int];
      v_full := split_part(v_format, 'v', 1)::int * 2;
      v_cap := v_full + 2;
      v_host := v_fakes[1 + floor(random() * 24)::int];
      v_min := (array[0, 0, 70, 80, 90])[1 + floor(random() * 5)::int];
      if (select reliability from profiles where id = v_host) < v_min then v_min := 0; end if;
      v_join := greatest(2, least(v_cap, round(v_cap * (0.3 + random() * 0.7))::int));
      insert into games (host_id, sport_id, format, location_id, starts_at, duration_min, capacity, min_players, skill, min_reliability, notes)
      values (v_host, 'soccer', v_format, v_locs[1 + floor(random() * array_length(v_locs, 1))::int], v_start,
        (array[60, 90, 90, 120])[1 + floor(random() * 4)::int], v_cap, v_full,
        (array['any', 'any', 'casual', 'intermediate', 'competitive'])[1 + floor(random() * 5)::int]::skill_level,
        v_min, v_notes[1 + floor(random() * array_length(v_notes, 1))::int])
      returning id into v_game;
      insert into demo_seed_games values (v_game);
      insert into game_participants (game_id, user_id, status, joined_at, confirmed_at)
      values (v_game, v_host, 'joined', now() - interval '2 days', now());
      insert into game_participants (game_id, user_id, status, joined_at, confirmed_at)
      select v_game, u, 'joined', now() - make_interval(hours => 1 + floor(random() * 40)::int),
        case when v_start < now() + interval '24 hours' and random() < 0.7 then now() end
      from unnest(v_fakes) u join profiles p on p.id = u
      where u <> v_host and p.reliability >= v_min
      order by random() limit v_join - 1;
      v_count := v_count + 1;
    end loop;
  end loop;

  -- ── The viewer's story ────────────────────────────────────────────────
  -- Undo anything a previous run left on the viewer's own profile.
  delete from late_leaves where user_id = v_viewer;

  for r in
    select * from (values
      -- hours ago it started, format, location, viewer hosts?, viewer's mark ('unmarked' / 'vote' = none)
      (2.75, '5v5', 'mitchell', true, 'unmarked'),
      (20.0, '7v7', 'palmer-field', true, 'unmarked'),
      (31.5, '5v5', 'hadley', false, 'vote'),
      (4 * 24.0, '7v7', 'palmer-field', false, 'present'),
      (6 * 24.0, '5v5', 'hadley', true, 'present'),
      (8 * 24.0, '7v7', 'hubbard-turf', false, 'late'),
      (9 * 24.0, '11v11', 'fuller-park', false, 'no_show'),
      (13 * 24.0, '5v5', 'coliseum', false, 'no_show'),
      (16 * 24.0, '7v7', 'burns-park', false, 'no_show'),
      (20 * 24.0, '5v5', 'mitchell', false, 'present'),
      (24 * 24.0, '7v7', 'palmer-field', false, 'left_early'),
      (28 * 24.0, '5v5', 'hadley', false, 'present')
    ) t(hours_ago, format, loc, hosted, outcome)
  loop
    v_full := split_part(r.format, 'v', 1)::int * 2;
    v_start := date_trunc('minute', now() - make_interval(secs => r.hours_ago * 3600));
    v_start := v_start - make_interval(mins => extract(minute from v_start)::int % 15);
    v_host := case when r.hosted then v_viewer else v_fakes[1 + floor(random() * 24)::int] end;
    insert into games (host_id, sport_id, format, location_id, starts_at, duration_min, capacity, min_players, status, attendance_by)
    values (v_host, 'soccer', r.format, coalesce((select id from locations where id = r.loc), v_locs[1]), v_start, 90, v_full + 2, v_full, 'completed',
      case when r.outcome in ('unmarked', 'vote') then null else 'host' end)
    returning id into v_game;
    insert into demo_seed_games values (v_game);
    insert into game_participants (game_id, user_id, status, joined_at, confirmed_at, mark, attended)
    select v_game, u, 'joined', v_start - interval '1 day', v_start - interval '2 hours',
      case when r.outcome in ('unmarked', 'vote') then null else 'present' end::attendance_mark,
      case when r.outcome in ('unmarked', 'vote') then null else true end
    from (
      select v_host as u
      union
      select u from (select u from unnest(v_fakes) u where u <> v_host order by random() limit v_full - 2) pick
    ) x;
    insert into game_participants (game_id, user_id, status, joined_at, confirmed_at, mark, attended)
    values (v_game, v_viewer, 'joined', v_start - interval '1 day', v_start - interval '2 hours',
      case when r.outcome in ('unmarked', 'vote') then null else r.outcome end::attendance_mark,
      case when r.outcome in ('unmarked', 'vote') then null else r.outcome <> 'no_show' end)
    on conflict (game_id, user_id) do nothing;

    -- Half the players have already voted: most say everyone came, one
    -- player looks like a no-show, and one has no votes yet.
    if r.outcome = 'vote' then
      insert into attendance_votes (game_id, voter_id, player_id, showed)
      select v_game, voter.user_id, player.user_id, player.n <> 4 or voter.n = 5
      from (select user_id, row_number() over (order by user_id) n from game_participants where game_id = v_game and user_id <> v_viewer) voter
      cross join (select user_id, row_number() over (order by user_id) n from game_participants where game_id = v_game and user_id <> v_viewer) player
      where voter.n <= 5 and voter.user_id <> player.user_id and player.n <> 6;
      -- And they all say the viewer came.
      insert into attendance_votes (game_id, voter_id, player_id, showed)
      select v_game, user_id, v_viewer, true
      from (select user_id, row_number() over (order by user_id) n from game_participants where game_id = v_game and user_id <> v_viewer) voter
      where n <= 5;
    end if;
  end loop;

  -- Two upcoming games the viewer is already in: one in 45 minutes
  -- (inside the late-leave window, and check-in is already open) and one they host tomorrow evening.
  for i in 1 .. 2 loop
    v_start := case when i = 1
      then date_trunc('minute', now()) + interval '45 minutes'
      else date_trunc('day', now() at time zone 'America/Detroit') at time zone 'America/Detroit' + interval '1 day 18 hours' end;
    v_format := case when i = 1 then '5v5' else '7v7' end;
    v_full := split_part(v_format, 'v', 1)::int * 2;
    v_host := case when i = 1 then (select id from profiles where id = any (v_fakes) and reliability >= 90 order by uniqname limit 1) else v_viewer end;
    insert into games (host_id, sport_id, format, location_id, starts_at, duration_min, capacity, min_players, min_reliability, notes)
    values (v_host, 'soccer', v_format, case when i = 1 then 'mitchell' else 'palmer-field' end, v_start, 90, v_full + 2, v_full,
      case when i = 1 then 70 else 70 end, case when i = 1 then 'Bring a dark and a light shirt.' else '' end)
    returning id into v_game;
    insert into demo_seed_games values (v_game);
    insert into game_participants (game_id, user_id, status, joined_at, confirmed_at)
    select v_game, u, 'joined', now() - interval '3 hours', case when u = v_host then now() end
    from (
      select v_host as u union select v_viewer
      union select u from (select u from unnest(v_fakes) u join profiles p on p.id = u where u <> v_host and p.reliability >= 70 order by random() limit v_full - 4) pick
    ) x;
  end loop;

  -- A host invites the viewer to a game whose minimum they're below, to
  -- show that a host's invite lets them in anyway.
  insert into game_invites (game_id, inviter_id, invitee_id, from_host)
  select g.id, g.host_id, v_viewer, true
  from games g join demo_seed_games d on d.game_id = g.id
  where g.min_reliability >= 80 and g.starts_at > now() + interval '1 day' and g.host_id <> v_viewer
    and not exists (select 1 from game_participants gp where gp.game_id = g.id and gp.user_id = v_viewer)
    and (select count(*) from game_participants gp where gp.game_id = g.id) < g.capacity
  order by g.starts_at
  limit 1;

  for i in 1 .. 24 loop
    perform _refresh_profile_stats(v_fakes[i]);
  end loop;
  perform _refresh_profile_stats(v_viewer);

  return jsonb_build_object(
    'fakePlayers', 24,
    'upcomingGames', v_count,
    'viewerReliability', (select reliability from profiles where id = v_viewer)
  );
end;
$$;


-- ── Grants ──────────────────────────────────────────────────────────────

revoke execute on function public._distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function
  public.check_in(uuid, double precision, double precision),
  public.invite_players(uuid, uuid[]),
  public.uninvite_player(uuid, uuid)
from public, anon;
