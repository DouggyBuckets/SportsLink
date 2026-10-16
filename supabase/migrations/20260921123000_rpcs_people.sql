-- Account, profile, availability matching, friends and safety RPCs.

-- ── Auth ────────────────────────────────────────────────────────────────

-- Lets the login screen say "Welcome back" vs "Check your inbox" before the
-- code is entered. Same pattern as the other apps. Callable signed-out by
-- necessity, so it answers only yes/no for a full, exact address.
create function public.check_user_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;

grant execute on function public.check_user_exists(text) to anon, authenticated;

-- App Store requirement. Hosted games are handed off (or cancelled if empty)
-- before the cascade removes everything else.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  v_game uuid;
begin
  for v_game in
    select gp.game_id from game_participants gp join games g on g.id = gp.game_id
    where gp.user_id = v_uid and g.status = 'open' and g.starts_at > now()
  loop
    perform _remove_participant(v_game, v_uid);
  end loop;
  delete from auth.users where id = v_uid;
end;
$$;

-- ── Bootstrap ───────────────────────────────────────────────────────────

create function public.get_friends()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user', _profile_json(case when f.requester_id = _uid() then f.addressee_id else f.requester_id end),
    'state', case when f.status = 'accepted' then 'friends'
                  when f.requester_id = _uid() then 'outgoing'
                  else 'incoming' end
  ) order by f.created_at desc), '[]'::jsonb)
  from friendships f
  where _uid() in (f.requester_id, f.addressee_id);
$$;

-- One call on launch: everything the store needs.
create function public.bootstrap()
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
    'me', _profile_json(v_uid) || jsonb_build_object('onboarded', (select onboarded from profiles where id = v_uid)),
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

-- ── Profile & availability ──────────────────────────────────────────────

-- p: { name, classYear, bio, sports: [{ sport, skill }], onboarded }
create function public.save_profile(p jsonb)
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
  where exists (select 1 from sports where id = s->>'sport')
  on conflict do nothing;
end;
$$;

-- p_blocks: [{ day, start, end }], already merged by the client. Replaced
-- wholesale, atomically, so matching never sees a half-saved week.
create function public.set_availability(p_blocks jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if jsonb_array_length(p_blocks) > 60 then
    raise exception 'Too many availability blocks.';
  end if;
  delete from availability_blocks where user_id = v_uid;
  insert into availability_blocks (user_id, day_of_week, start_min, end_min)
  select v_uid, (b->>'day')::smallint, (b->>'start')::smallint, (b->>'end')::smallint
  from jsonb_array_elements(p_blocks) b;
end;
$$;

-- ── "Looking to play" matching ──────────────────────────────────────────

create function public.set_interest(p_sport text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if p_on then
    insert into sport_interests (user_id, sport_id) values (v_uid, p_sport)
    on conflict (user_id, sport_id) do update set created_at = now(), expires_at = now() + interval '7 days';
  else
    delete from sport_interests where user_id = v_uid and sport_id = p_sport;
  end if;
end;
$$;

-- For each hour the caller is free: how many other students who want to play
-- p_sport are free too. This is the only way anyone's schedule is ever used
-- across accounts, and all that leaves is a count per hour - never who.
-- Returns [{ day, hour, count }]; the client groups hours into windows.
create function public.interest_overlap(p_sport text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with my_hours as (
    select distinct b.day_of_week as d, h
    from availability_blocks b, generate_series(b.start_min / 60, (b.end_min - 1) / 60) h
    where b.user_id = _uid()
  ),
  their_hours as (
    select distinct i.user_id, b.day_of_week as d, h
    from sport_interests i
    join availability_blocks b on b.user_id = i.user_id,
    generate_series(b.start_min / 60, (b.end_min - 1) / 60) h
    where i.sport_id = p_sport
      and i.expires_at > now()
      and i.user_id <> _uid()
      and not _is_blocked(i.user_id, _uid())
  ),
  counted as (
    select m.d, m.h, count(*) as c
    from my_hours m join their_hours t on t.d = m.d and t.h = m.h
    group by m.d, m.h
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d, 'hour', h, 'count', c) order by d, h), '[]'::jsonb)
  from counted;
$$;

-- ── People ──────────────────────────────────────────────────────────────

create function public.search_people(p_query text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(_profile_json(x.id)), '[]'::jsonb)
  from (
    select p.id from profiles p
    where char_length(btrim(p_query)) >= 2
      and p.onboarded
      and p.id <> _uid()
      and not _is_blocked(p.id, _uid())
      and (lower(p.full_name) like '%' || lower(btrim(p_query)) || '%' or p.uniqname like lower(btrim(p_query)) || '%')
    order by p.full_name
    limit 20
  ) x;
$$;

create function public.get_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when _is_blocked(p_user_id, _uid()) then null else _profile_json(p_user_id) end;
$$;

-- ── Friends ─────────────────────────────────────────────────────────────

create function public.request_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if p_user_id = v_uid or _is_blocked(v_uid, p_user_id) then
    raise exception 'You can''t add this player.';
  end if;
  -- If they already asked us, asking back is accepting.
  update friendships set status = 'accepted', responded_at = now()
  where requester_id = p_user_id and addressee_id = v_uid and status = 'pending';
  if found then return; end if;

  insert into friendships (requester_id, addressee_id) values (v_uid, p_user_id)
  on conflict do nothing;
end;
$$;

create function public.respond_friend(p_user_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accept then
    update friendships set status = 'accepted', responded_at = now()
    where requester_id = p_user_id and addressee_id = _uid() and status = 'pending';
  else
    delete from friendships where requester_id = p_user_id and addressee_id = _uid() and status = 'pending';
  end if;
end;
$$;

create function public.remove_friend(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from friendships
  where least(requester_id, addressee_id) = least(_uid(), p_user_id)
    and greatest(requester_id, addressee_id) = greatest(_uid(), p_user_id);
$$;

-- ── Safety ──────────────────────────────────────────────────────────────

-- Silent and mutual: unfriends, drops pending invites both ways, and pulls
-- the caller out of upcoming games the blocked player hosts.
create function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
  v_game uuid;
begin
  if p_user_id = v_uid then return; end if;
  insert into blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;
  perform remove_friend(p_user_id);
  delete from game_invites
  where (inviter_id = v_uid and invitee_id = p_user_id) or (inviter_id = p_user_id and invitee_id = v_uid);
  for v_game in
    select g.id from games g join game_participants gp on gp.game_id = g.id
    where g.host_id = p_user_id and gp.user_id = v_uid and g.status = 'open' and g.starts_at > now()
  loop
    perform _remove_participant(v_game, v_uid);
  end loop;
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from blocks where blocker_id = _uid() and blocked_id = p_user_id;
$$;

create function public.report_user(p_user_id uuid, p_reason text, p_game_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := _uid();
begin
  if (select count(*) from reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent a lot of reports today. Please try again tomorrow.';
  end if;
  insert into reports (reporter_id, reported_user_id, game_id, reason) values (v_uid, p_user_id, p_game_id, left(p_reason, 200));
end;
$$;

revoke execute on function
  public.delete_own_account(),
  public.get_friends(),
  public.bootstrap(),
  public.save_profile(jsonb),
  public.set_availability(jsonb),
  public.set_interest(text, boolean),
  public.interest_overlap(text),
  public.search_people(text),
  public.get_profile(uuid),
  public.request_friend(uuid),
  public.respond_friend(uuid, boolean),
  public.remove_friend(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.report_user(uuid, text, uuid)
from public, anon;
