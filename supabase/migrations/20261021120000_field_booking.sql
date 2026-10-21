-- Field reservations. Nobody offers a booking API (U-M rentals are a request
-- form, the city is email/phone), so the host books through the official
-- process and records it here: "requested" once they've submitted the form,
-- "confirmed" once they have the approval, plus the confirmation/rental
-- number so anyone can check it with Michigan Recreation or City Parks.

alter table public.games
  add column field_booking text not null default 'none' check (field_booking in ('none', 'requested', 'confirmed')),
  add column booking_ref text not null default '' check (char_length(booking_ref) <= 40);

-- A booking is for a time and place: moving the game voids it.
create or replace function public._reset_field_booking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.starts_at <> old.starts_at or new.location_id <> old.location_id or new.duration_min > old.duration_min then
    new.field_booking := 'none';
    new.booking_ref := '';
  end if;
  return new;
end;
$$;

create trigger games_reset_field_booking
  before update of starts_at, location_id, duration_min on public.games
  for each row execute function public._reset_field_booking();

-- Same as before, plus fieldBooking and bookingRef.
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
    'fieldBooking', g.field_booking,
    'bookingRef', g.booking_ref,
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

create or replace function public.set_field_booking(p_game_id uuid, p_status text, p_ref text)
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
  if not found or g.host_id is distinct from v_uid then
    raise exception 'Only the host can update the field booking.';
  end if;
  if g.status <> 'open' or g.starts_at + make_interval(mins => g.duration_min) <= now() then
    raise exception 'This game is over.';
  end if;
  if p_status not in ('none', 'requested', 'confirmed') then
    raise exception 'Unknown booking status.';
  end if;

  update games set field_booking = p_status, booking_ref = case when p_status = 'none' then '' else left(btrim(coalesce(p_ref, '')), 40) end
  where id = p_game_id;

  if p_status = 'confirmed' and g.field_booking <> 'confirmed' then
    perform _system_message(p_game_id, 'The host reserved the field');
  end if;
  return _game_json_by_id(p_game_id);
end;
$$;

revoke execute on function public._reset_field_booking() from public, anon, authenticated;
revoke execute on function public.set_field_booking(uuid, text, text) from public, anon;
