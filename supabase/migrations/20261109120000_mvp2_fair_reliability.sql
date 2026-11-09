-- MVP2: a fairer reliability score, from Preso #4 user testing.
--
--   * Attendance isn't all or nothing. Hosts mark each player present, late,
--     left early or no-show, worth 100 / 75 / 50 / 0% credit.
--   * Hosts get 24 hours after the game to mark it. If they don't, every
--     player in the game can vote (anonymously) on everyone else until 72
--     hours after the game, and the majority answer for each player counts
--     (a tie counts as showed up; a player nobody voted on isn't counted).
--   * Scores recover. The credit a game didn't earn counts 0.85x less for
--     each full week since it, so old misses fade and a low score climbs
--     back on its own, faster by playing. `reliability` becomes a stored
--     number kept current by _refresh_profile_stats and a daily job.
--
-- Mirrors lib/reliability.ts (MARK_CREDIT, MISS_DECAY, FREE_GAMES) and
-- lib/selectors.ts (HOST_MARK_HOURS, VOTE_CLOSE_HOURS).

-- ── Marks ───────────────────────────────────────────────────────────────

create type public.attendance_mark as enum ('present', 'late', 'left_early', 'no_show');

-- `attended` stays, kept in sync (false only for a no-show), so games_played
-- and older queries keep working.
alter table public.game_participants add column mark public.attendance_mark;
update public.game_participants
  set mark = case when attended then 'present'::public.attendance_mark else 'no_show'::public.attendance_mark end
  where attended is not null;

-- Who settled a game's attendance: 'host' or 'vote'. null = not yet.
alter table public.games add column attendance_by text check (attendance_by in ('host', 'vote'));
update public.games g set attendance_by = 'host'
  where exists (select 1 from public.game_participants gp where gp.game_id = g.id and gp.attended is not null);

-- ── Votes ───────────────────────────────────────────────────────────────

create table public.attendance_votes (
  game_id uuid not null references public.games (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  showed boolean not null,
  created_at timestamptz not null default now(),
  primary key (game_id, voter_id, player_id),
  check (voter_id <> player_id)
);

-- Votes are anonymous: only reached through the security definer functions
-- below, which return totals, never who voted what (except your own).
alter table public.attendance_votes enable row level security;

create function public._game_end(g public.games)
returns timestamptz
language sql
immutable
as $$
  select g.starts_at + make_interval(mins => g.duration_min);
$$;

-- ── Score ───────────────────────────────────────────────────────────────

-- Every game that counts toward a player's score, with the credit it earned.
-- Leaving within 2 hours of kickoff earns none.
create function public._score_events(p_user_id uuid)
returns table (played_at timestamptz, credit numeric)
language sql
stable
security definer
set search_path = public
as $$
  select g.starts_at,
    case gp.mark when 'present' then 1.0 when 'late' then 0.75 when 'left_early' then 0.5 else 0.0 end
  from game_participants gp join games g on g.id = gp.game_id
  where gp.user_id = p_user_id and gp.mark is not null
  union all
  select l.left_at, 0.0 from late_leaves l where l.user_id = p_user_id;
$$;

-- (credit earned + 2 free games) / (games + 2), where the credit a game
-- missed shrinks by 0.85x for each full week since it.
create function public._reliability(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select round(
    (count(*) + 2 - coalesce(sum((1 - credit) * power(0.85, greatest(0, floor(extract(epoch from now() - played_at) / 604800)))), 0))
    * 100.0 / (count(*) + 2)
  )::integer
  from _score_events(p_user_id);
$$;

alter table public.profiles drop column reliability;
alter table public.profiles add column reliability integer not null default 100;

create or replace function public._refresh_profile_stats(p_user_id uuid)
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
    attended_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.mark <> 'no_show'),
    no_show_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.mark = 'no_show')
      + (select count(*) from late_leaves l where l.user_id = p_user_id),
    reliability = _reliability(p_user_id)
  where p.id = p_user_id;
$$;

-- Old misses keep fading after the last game, so scores move without any
-- new activity. Only players with something less than full credit change.
create function public.refresh_fading_scores()
returns void
language sql
security definer
set search_path = public
as $$
  select _refresh_profile_stats(u.user_id)
  from (
    select user_id from game_participants where mark is not null and mark <> 'present'
    union
    select user_id from late_leaves
  ) u;
$$;

-- Bring every existing score onto the new formula.
select public._refresh_profile_stats(id) from public.profiles;

-- ── Host marking ────────────────────────────────────────────────────────

-- p_marks: { "<user id>": "present" | "late" | "left_early" | "no_show" }.
-- Anyone in the game who isn't listed is a no-show (the host, present).
-- Safe to call again within the window to correct a mistake: stats are
-- recomputed, not incremented.
create function public.mark_attendance(p_game_id uuid, p_marks jsonb)
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
      coalesce(
        (p_marks->>gp2.user_id::text)::attendance_mark,
        case when gp2.user_id = g.host_id then 'present' else 'no_show' end::attendance_mark
      ) as mark
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

-- The MVP1 call (a list of who showed) still works, as present / no-show.
create or replace function public.mark_attendance(p_game_id uuid, p_attended uuid[])
returns jsonb
language sql
security definer
set search_path = public
as $$
  select mark_attendance(
    p_game_id,
    coalesce((
      select jsonb_object_agg(gp.user_id, case when gp.user_id = any (p_attended) then 'present' else 'no_show' end)
      from game_participants gp where gp.game_id = p_game_id
    ), '{}'::jsonb)
  );
$$;

-- ── Player vote ─────────────────────────────────────────────────────────

-- Majority answer per player, from the votes cast. Caller must hold the
-- game row lock.
create function public._settle_attendance_vote(p_game_id uuid)
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
  where gp.game_id = p_game_id and gp.user_id = t.player_id;

  update games set
    status = case when status = 'open' then 'completed'::game_status else status end,
    attendance_by = 'vote'
  where id = p_game_id;

  for v_user in select user_id from game_participants where game_id = p_game_id loop
    perform _refresh_profile_stats(v_user);
  end loop;
end;
$$;

-- p_votes: { "<player id>": true (showed up) | false }. Players in the game
-- vote on everyone but themselves, between 24 and 72 hours after it ends,
-- and can change their votes until then. Voting closes early once everyone
-- has voted.
create function public.vote_attendance(p_game_id uuid, p_votes jsonb)
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
  where gp.game_id = p_game_id and gp.user_id <> v_uid and p_votes ? gp.user_id::text
  on conflict (game_id, voter_id, player_id) do update set showed = excluded.showed, created_at = now();

  if (select count(distinct voter_id) from attendance_votes where game_id = p_game_id)
     >= (select count(*) from game_participants where game_id = p_game_id) then
    perform _settle_attendance_vote(p_game_id);
  end if;
  return _game_json_by_id(p_game_id);
end;
$$;

-- Closes votes 72 hours after each game. A game nobody voted on is left
-- unsettled: it doesn't count for anyone.
create function public.settle_attendance_votes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game uuid;
begin
  for v_game in
    select g.id from games g
    where g.attendance_by is null and g.status <> 'cancelled'
      and _game_end(g) + interval '72 hours' <= now()
      and exists (select 1 from attendance_votes v where v.game_id = g.id)
    for update
  loop
    perform _settle_attendance_vote(v_game);
  end loop;
end;
$$;

-- ── JSON ────────────────────────────────────────────────────────────────

-- Game: participants gain `mark`; games gain `attendanceBy` and, while the
-- viewer can vote, `attendanceVote` (totals plus the viewer's own votes).
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
        'attended', gp.attended
      ) order by gp.joined_at)
      from game_participants gp where gp.game_id = g.id
    ), '[]'::jsonb),
    'attendanceBy', g.attendance_by,
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

-- The viewer's own profile carries scoreEvents, so the app can show how
-- their score will recover.
create or replace function public.bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  return jsonb_build_object(
    'me', _profile_json(v_uid) || jsonb_build_object(
      'onboarded', (select onboarded from profiles where id = v_uid),
      'scoreEvents', coalesce((select jsonb_agg(jsonb_build_object('at', e.played_at, 'credit', e.credit) order by e.played_at desc) from _score_events(v_uid) e), '[]'::jsonb)
    ),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object('day', day_of_week, 'start', start_min, 'end', end_min) order by day_of_week, start_min)
      from availability_blocks where user_id = v_uid
    ), '[]'::jsonb),
    'interests', coalesce((
      select jsonb_agg(sport_id) from sport_interests where user_id = v_uid and expires_at > now()
    ), '[]'::jsonb),
    'games', get_games(),
    'friends', get_friends(),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('gameId', i.game_id, 'from', _mini_json(i.inviter_id)) order by i.created_at desc)
      from game_invites i join games g on g.id = i.game_id
      where i.invitee_id = v_uid and i.status = 'pending' and g.status = 'open' and g.starts_at > now()
        and not _is_blocked(i.inviter_id, v_uid)
    ), '[]'::jsonb),
    'blockedIds', coalesce((select jsonb_agg(blocked_id) from blocks where blocker_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- ── Grants and jobs ─────────────────────────────────────────────────────

revoke execute on function
  public._game_end(public.games),
  public._score_events(uuid),
  public._reliability(uuid),
  public._settle_attendance_vote(uuid),
  public.refresh_fading_scores(),
  public.settle_attendance_votes()
from public, anon, authenticated;

revoke execute on function
  public.mark_attendance(uuid, jsonb),
  public.vote_attendance(uuid, jsonb)
from public, anon;

select cron.schedule('sportslink-settle-votes', '*/10 * * * *', $$select public.settle_attendance_votes()$$);
select cron.schedule('sportslink-fading-scores', '15 8 * * *', $$select public.refresh_fading_scores()$$);
