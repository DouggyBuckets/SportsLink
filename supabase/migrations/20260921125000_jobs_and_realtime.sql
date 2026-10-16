-- Background jobs (pg_cron) and Realtime.

-- ── Official games ──────────────────────────────────────────────────────

-- Materialise official_sessions into real, joinable games for the next
-- p_days_ahead days. Idempotent via unique (official_session_id, starts_at).
-- Local wall-clock time is converted with the campus timezone so a 5pm
-- session stays 5pm across daylight-saving changes.
create function public.generate_official_games(p_days_ahead integer default 7)
returns void
language sql
security definer
set search_path = public
as $$
  insert into games (host_id, sport_id, format, location_id, location_note, starts_at, duration_min, capacity, min_players, notes, is_official, official_session_id)
  select
    null, s.sport_id, s.format, s.location_id, s.location_note,
    (d::date + make_interval(mins => s.start_min)) at time zone 'America/Detroit',
    s.duration_min, s.capacity, 2, s.notes, true, s.id
  from official_sessions s
  cross join generate_series(
    (now() at time zone 'America/Detroit')::date::timestamp,
    ((now() at time zone 'America/Detroit')::date + p_days_ahead)::timestamp,
    interval '1 day'
  ) d
  where s.active
    and extract(dow from d)::int = s.day_of_week
    and (d::date + make_interval(mins => s.start_min)) at time zone 'America/Detroit' > now()
  on conflict (official_session_id, starts_at) do nothing;
$$;

-- ── Lifecycle ───────────────────────────────────────────────────────────

-- Finished games are kept, not deleted: they're what profile stats, history
-- and reliability are computed from. They simply stop being 'open'.
create function public.complete_finished_games()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    with done as (
      update games set status = 'completed'
      where status = 'open' and starts_at + make_interval(mins => duration_min) < now()
      returning id, host_id
    )
    select gp.user_id from game_participants gp join done on done.id = gp.game_id
    union
    select host_id from done where host_id is not null
  loop
    perform _refresh_profile_stats(v_user);
  end loop;
end;
$$;

-- What actually gets deleted, and when:
--   * chat: 14 days after the game ends
--   * cancelled games: after 30 days
--   * official drop-ins nobody joined: once they're over
--   * completed games: after a year (stats are denormalised on profiles, so
--     totals survive; only the "recent games" list shortens)
--   * expired "looking to play" flags and stale invites
create function public.purge_stale_data()
returns void
language sql
security definer
set search_path = public
as $$
  delete from game_messages m using games g
    where g.id = m.game_id and g.starts_at + make_interval(mins => g.duration_min) < now() - interval '14 days';
  delete from games where status = 'cancelled' and cancelled_at < now() - interval '30 days';
  delete from games g where g.is_official and g.starts_at < now() - interval '1 day'
    and not exists (select 1 from game_participants gp where gp.game_id = g.id);
  delete from games where status = 'completed' and starts_at < now() - interval '1 year';
  delete from sport_interests where expires_at < now();
  delete from game_invites i using games g where g.id = i.game_id and g.starts_at < now();
$$;

revoke execute on function
  public.generate_official_games(integer),
  public.complete_finished_games(),
  public.purge_stale_data()
from public, anon, authenticated;

-- ── Schedules ───────────────────────────────────────────────────────────
-- pg_cron must be enabled for the project (Dashboard > Database > Extensions).

create extension if not exists pg_cron;

select cron.schedule('sportslink-complete-games', '*/10 * * * *', $$select public.complete_finished_games()$$);
select cron.schedule('sportslink-official-games', '5 8 * * *', $$select public.generate_official_games()$$);
select cron.schedule('sportslink-purge', '30 8 * * *', $$select public.purge_stale_data()$$);

-- First week of official games, so the feed isn't empty until the first run.
select public.generate_official_games();

-- ── Realtime ────────────────────────────────────────────────────────────
-- Group chat streams over Realtime; the SELECT policy on game_messages
-- limits delivery to members of that game.
alter publication supabase_realtime add table public.game_messages;
