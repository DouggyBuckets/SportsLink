-- MVP1 rules for joining and leaving games.
--
--   * No waitlist: a full game simply can't be joined. The participant_status
--     enum keeps its 'waitlist' value so earlier migrations stay valid, but a
--     check constraint now rejects it.
--   * Leaving (or, for the host, cancelling) within 2 hours of kickoff while
--     other players are in counts as a missed game for reliability. Mirrors
--     LATE_LEAVE_HOURS in lib/reliability.ts. Rejoining the same game clears
--     the miss - you're back on the hook to show up.
--   * Profiles expose `attended` so the app can show "showed up 8 of 9".

delete from public.game_participants where status = 'waitlist';

alter table public.game_participants
  add constraint game_participants_joined_only check (status = 'joined');

-- leave_game and update_game still call this; with no one waiting there is
-- nothing to promote.
create or replace function public._promote_waitlist(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  null;
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
    if v_reliability < g.min_reliability then
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

-- ── Late leaves ─────────────────────────────────────────────────────────

create table public.late_leaves (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  left_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- Only reached through the security definer functions below.
alter table public.late_leaves enable row level security;

-- Records a miss if p_user_id is backing out of p_game_id too close to
-- kickoff while someone else is still counting on them. Caller must hold the
-- game row lock.
create function public._record_late_leave(p_game_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from games g
    where g.id = p_game_id and g.status = 'open'
      and g.starts_at - now() < interval '2 hours'
  ) and exists (
    select 1 from game_participants where game_id = p_game_id and user_id = p_user_id
  ) and exists (
    select 1 from game_participants where game_id = p_game_id and user_id <> p_user_id
  ) then
    insert into late_leaves (game_id, user_id) values (p_game_id, p_user_id) on conflict do nothing;
    perform _refresh_profile_stats(p_user_id);
  end if;
end;
$$;

-- Late leaves count as misses alongside host-marked no-shows.
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
    attended_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.attended is true),
    no_show_count = (select count(*) from game_participants gp where gp.user_id = p_user_id and gp.attended is false)
      + (select count(*) from late_leaves l where l.user_id = p_user_id)
  where p.id = p_user_id;
$$;

create or replace function public.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  -- Once a game has kicked off, not turning up is a no-show, not a "leave".
  if exists (select 1 from games where id = p_game_id and status = 'open' and starts_at <= now()) then
    raise exception 'This game has already started.';
  end if;
  perform 1 from games where id = p_game_id for update;
  perform _record_late_leave(p_game_id, v_uid);
  perform _remove_participant(p_game_id, v_uid);
  return _game_json_by_id(p_game_id);
end;
$$;

create or replace function public.cancel_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g games;
begin
  select * into g from games where id = p_game_id for update;
  if not found or g.host_id is distinct from _uid() then
    raise exception 'Only the host can cancel this game.';
  end if;
  if g.status <> 'open' or g.starts_at <= now() then
    raise exception 'This game can no longer be cancelled.';
  end if;
  perform _record_late_leave(p_game_id, g.host_id);
  update games set status = 'cancelled', cancelled_at = now() where id = p_game_id;
  perform _system_message(p_game_id, 'The host cancelled this game');
  return _game_json_by_id(p_game_id);
end;
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
    'attended', p.attended_count,
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

revoke execute on function public._record_late_leave(uuid, uuid) from public, anon, authenticated;
