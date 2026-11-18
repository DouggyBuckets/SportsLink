-- Check-in proves a player came, not that they stayed. So a check-in now
-- only rules out a no-show: the host can still mark a checked-in player
-- late or left early. (They're still left out of the player vote, which
-- only decides showed up vs no-show.)

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
      case
        -- Checked in at the field: can be late or left early, never a no-show.
        when gp2.checked_in_at is not null then
          case when p_marks->>gp2.user_id::text in ('late', 'left_early') then (p_marks->>gp2.user_id::text)::attendance_mark else 'present'::attendance_mark end
        else coalesce(
          (p_marks->>gp2.user_id::text)::attendance_mark,
          case when gp2.user_id = g.host_id then 'present' else 'no_show' end::attendance_mark
        )
      end as mark
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

create or replace function public.check_in(p_game_id uuid, p_lat double precision, p_lng double precision)
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

  -- Keeps a late / left early mark the host already gave; anything else
  -- (no mark yet, or a no-show) becomes present.
  update game_participants set checked_in_at = coalesce(checked_in_at, now()),
    mark = case when mark in ('late', 'left_early') then mark else 'present' end, attended = true
  where game_id = p_game_id and user_id = v_uid;
  perform _refresh_profile_stats(v_uid);
  return _game_json_by_id(p_game_id);
end;
$$;
