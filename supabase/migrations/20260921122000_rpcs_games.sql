-- Game lifecycle RPCs. Each returns the same JSON the client keeps in its
-- store, so a mutation and its refresh are one round trip.
--
-- Anything that reads-then-writes a roster takes `for update` on the game row
-- first. That single lock is what makes "last spot" races safe: two students
-- tapping Join at once are serialised, and the second lands on the waitlist.

-- ── Reads ───────────────────────────────────────────────────────────────

-- Everything the client's game list needs: the joinable feed, plus the
-- caller's own upcoming games and their last 60 days of history.
create function public.get_games()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(_game_json(g) order by g.starts_at), '[]'::jsonb)
  from games g
  where (
      g.status = 'open' and g.starts_at > now() and _can_see_game(g, _uid())
    ) or (
      g.starts_at > now() - interval '60 days' and _is_game_member(g.id, _uid())
    );
$$;

-- ── Internal roster mechanics ───────────────────────────────────────────

-- Fill open spots from the waitlist, longest-waiting first. Caller must hold
-- the game row lock.
create function public._promote_waitlist(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_joined integer;
  v_next uuid;
begin
  select capacity into v_capacity from games where id = p_game_id;
  loop
    select count(*) into v_joined from game_participants where game_id = p_game_id and status = 'joined';
    exit when v_joined >= v_capacity;
    select user_id into v_next from game_participants
      where game_id = p_game_id and status = 'waitlist' order by joined_at limit 1;
    exit when v_next is null;
    update game_participants set status = 'joined' where game_id = p_game_id and user_id = v_next;
    perform _system_message(p_game_id, _display_name(v_next) || ' moved in from the waitlist');
  end loop;
end;
$$;

-- Remove someone from a game without stranding the group: their spot goes to
-- the waitlist, and if they were hosting, the earliest-joined player takes
-- over. Only a host leaving an otherwise empty game cancels it. Shared by
-- leave_game, block_user and delete_own_account.
create function public._remove_participant(p_game_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g games;
  v_heir uuid;
begin
  select * into g from games where id = p_game_id for update;
  if not found then return; end if;

  delete from game_participants where game_id = p_game_id and user_id = p_user_id;
  if not found and g.host_id is distinct from p_user_id then return; end if;

  if g.status <> 'open' or g.starts_at <= now() then return; end if;

  perform _system_message(p_game_id, _display_name(p_user_id) || ' left');
  perform _promote_waitlist(p_game_id);

  if g.host_id = p_user_id then
    select user_id into v_heir from game_participants
      where game_id = p_game_id and status = 'joined' order by joined_at limit 1;
    if v_heir is null then
      update games set status = 'cancelled', cancelled_at = now() where id = p_game_id;
    else
      update games set host_id = v_heir where id = p_game_id;
      perform _system_message(p_game_id, _display_name(v_heir) || ' is now hosting');
    end if;
  end if;
end;
$$;

-- ── Create / edit / cancel ──────────────────────────────────────────────

-- p is the client's NewGame object (camelCase keys).
create function public.create_game(p jsonb)
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

  insert into games (host_id, sport_id, custom_sport, format, location_id, location_note, starts_at, duration_min, capacity, min_players, skill, notes, visibility)
  values (
    v_uid,
    p->>'sport',
    case when p->>'sport' = 'other' then coalesce(p->>'customSport', '') else '' end,
    coalesce(nullif(p->>'format', ''), 'Pickup'),
    p->>'locationId',
    coalesce(p->>'locationNote', ''),
    (p->>'startsAt')::timestamptz,
    (p->>'durationMin')::integer,
    (p->>'capacity')::integer,
    least((p->>'minPlayers')::integer, (p->>'capacity')::integer),
    coalesce((p->>'skill')::skill_level, 'any'),
    coalesce(p->>'notes', ''),
    coalesce((p->>'visibility')::game_visibility, 'campus')
  )
  returning id into v_id;

  -- The host is always player one, already confirmed.
  insert into game_participants (game_id, user_id, status, confirmed_at) values (v_id, v_uid, 'joined', now());
  return _game_json_by_id(v_id);
end;
$$;

create function public.update_game(p_game_id uuid, p jsonb)
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
    sport_id = p->>'sport',
    custom_sport = case when p->>'sport' = 'other' then coalesce(p->>'customSport', '') else '' end,
    format = coalesce(nullif(p->>'format', ''), 'Pickup'),
    location_id = p->>'locationId',
    location_note = coalesce(p->>'locationNote', ''),
    starts_at = v_new_start,
    duration_min = (p->>'durationMin')::integer,
    capacity = (p->>'capacity')::integer,
    min_players = least((p->>'minPlayers')::integer, (p->>'capacity')::integer),
    skill = coalesce((p->>'skill')::skill_level, 'any'),
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

create function public.cancel_game(p_game_id uuid)
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
  update games set status = 'cancelled', cancelled_at = now() where id = p_game_id;
  perform _system_message(p_game_id, 'The host cancelled this game');
  return _game_json_by_id(p_game_id);
end;
$$;

-- ── Join / leave / confirm ──────────────────────────────────────────────

create function public.join_game(p_game_id uuid)
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
    select count(*) into v_joined from game_participants where game_id = p_game_id and status = 'joined';
    v_status := case when v_joined < g.capacity then 'joined' else 'waitlist' end;
    insert into game_participants (game_id, user_id, status) values (p_game_id, v_uid, v_status);
    perform _system_message(p_game_id, _display_name(v_uid) || case when v_status = 'joined' then ' joined' else ' joined the waitlist' end);
  end if;

  update game_invites set status = 'accepted' where game_id = p_game_id and invitee_id = v_uid and status = 'pending';
  return _game_json_by_id(p_game_id);
end;
$$;

create function public.leave_game(p_game_id uuid)
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
  perform _remove_participant(p_game_id, v_uid);
  return _game_json_by_id(p_game_id);
end;
$$;

create function public.confirm_spot(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update game_participants set confirmed_at = now()
  where game_id = p_game_id and user_id = _uid() and status = 'joined';
  if not found then
    raise exception 'You''re not on the roster for this game.';
  end if;
  return _game_json_by_id(p_game_id);
end;
$$;

-- ── After the game ──────────────────────────────────────────────────────

-- Host marks who showed. Everyone joined and not listed is a no-show. Safe to
-- call again to correct a mistake: stats are recomputed, not incremented.
create function public.mark_attendance(p_game_id uuid, p_attended uuid[])
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
  -- Reliability shouldn't be editable forever.
  if g.starts_at < now() - interval '7 days' then
    raise exception 'Attendance can only be changed for a week after the game.';
  end if;

  update game_participants set attended = (user_id = any (p_attended))
  where game_id = p_game_id and status = 'joined';
  update games set status = 'completed' where id = p_game_id and status = 'open';

  for v_user in select user_id from game_participants where game_id = p_game_id loop
    perform _refresh_profile_stats(v_user);
  end loop;
  return _game_json_by_id(p_game_id);
end;
$$;

-- ── Invites ─────────────────────────────────────────────────────────────

create function public.invite_friends(p_game_id uuid, p_invitee_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if not _is_game_member(p_game_id, v_uid) then
    raise exception 'Join the game before inviting people to it.';
  end if;
  -- Friends only: invites must never become a way to message strangers.
  insert into game_invites (game_id, inviter_id, invitee_id)
  select p_game_id, v_uid, f
  from unnest(p_invitee_ids) as f
  where _are_friends(v_uid, f) and not _is_game_member(p_game_id, f)
  on conflict (game_id, invitee_id) do nothing;
end;
$$;

create function public.decline_invite(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update game_invites set status = 'declined' where game_id = p_game_id and invitee_id = _uid() and status = 'pending';
$$;

-- ── Group chat ──────────────────────────────────────────────────────────

create function public.get_messages(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not _is_game_member(p_game_id, _uid()) then
    raise exception 'Join the game to see its chat.';
  end if;
  return coalesce((
    select jsonb_agg(_message_json(m) order by m.created_at)
    from game_messages m
    where m.id in (select id from game_messages where game_id = p_game_id order by created_at desc limit 200)
  ), '[]'::jsonb);
end;
$$;

create function public.send_message(p_game_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  m game_messages;
begin
  if not _is_game_member(p_game_id, v_uid) then
    raise exception 'Join the game to message the group.';
  end if;
  if exists (select 1 from games where id = p_game_id and status = 'cancelled') then
    raise exception 'This game was cancelled.';
  end if;
  -- Crude flood guard.
  if (select count(*) from game_messages where user_id = v_uid and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You''re sending messages too quickly.';
  end if;
  insert into game_messages (game_id, user_id, body) values (p_game_id, v_uid, btrim(p_body)) returning * into m;
  return _message_json(m);
end;
$$;

revoke execute on function
  public._promote_waitlist(uuid),
  public._remove_participant(uuid, uuid)
from public, anon, authenticated;

revoke execute on function
  public.get_games(),
  public.create_game(jsonb),
  public.update_game(uuid, jsonb),
  public.cancel_game(uuid),
  public.join_game(uuid),
  public.leave_game(uuid),
  public.confirm_spot(uuid),
  public.mark_attendance(uuid, uuid[]),
  public.invite_friends(uuid, uuid[]),
  public.decline_invite(uuid),
  public.get_messages(uuid),
  public.send_message(uuid, text)
from public, anon;
