-- Fake data for presentations, in the live project.
--
-- Defines seed_presentation_data(uniqname) but doesn't run it. Run it from
-- the SQL editor (it's revoked from app users):
--
--   select public.seed_presentation_data('smithsas');
--
-- Re-running wipes the previous fake data and rebuilds it relative to now,
-- so run it shortly before presenting: the "mark attendance" games only stay
-- markable for 24 hours after they end, and the vote closes 2 days later.
--
-- What it makes:
--   * 24 fake students (uniqnames ending in ".demo", no password, so nobody
--     can sign in as them) with varied reliability from a month of games
--   * two weeks of upcoming soccer games across campus, some with minimums
--   * for the given real account, the same story as the in-app demo:
--     ~73% and recovering after a run of misses 2-3 weeks ago, two games
--     they hosted waiting to be marked, one game to vote on, a late and a
--     left early, and two upcoming games they're in.
--
-- Everything fake is listed in demo_seed_games / matched by the ".demo"
-- email suffix, and nothing else is touched.

create table public.demo_seed_games (
  game_id uuid primary key references public.games (id) on delete cascade
);
alter table public.demo_seed_games enable row level security;

create function public.seed_presentation_data(p_viewer_uniqname text)
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

  -- Two upcoming games the viewer is already in: one in about an hour
  -- (inside the late-leave window) and one they host tomorrow evening.
  for i in 1 .. 2 loop
    v_start := case when i = 1
      then date_trunc('hour', now()) + interval '75 minutes'
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

revoke execute on function public.seed_presentation_data(text) from public, anon, authenticated;
