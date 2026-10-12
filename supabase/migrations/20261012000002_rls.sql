-- Row level security. Every table has RLS on with explicit policies.
-- Policies are "to authenticated" only, so signed-out (anon) requests see nothing.
-- Tables without insert/update/delete policies are read-only from the app;
-- their writes happen in security definer functions added in later migrations.

-- True when the current user has verified a @umich.edu email.
create function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
      and lower(email) like '%@umich.edu'
  );
$$;

revoke execute on function public.is_verified() from public, anon;
grant execute on function public.is_verified() to authenticated;

alter table public.profiles enable row level security;
alter table public.push_tokens enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.attendance enable row level security;
alter table public.reliability_events enable row level security;

-- profiles: everyone verified can read; you can create and edit only your own.
create policy "profiles: verified users can read"
  on public.profiles for select to authenticated
  using ((select public.is_verified()));

create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and (select public.is_verified()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and (select public.is_verified()));

-- push_tokens: private to their owner.
create policy "push_tokens: read own"
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_tokens: insert own"
  on public.push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_verified()));

create policy "push_tokens: update own"
  on public.push_tokens for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_tokens: delete own"
  on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- games: verified users can read and create (as themselves, status open).
-- Cancelling and completing go through host-only functions.
create policy "games: verified users can read"
  on public.games for select to authenticated
  using ((select public.is_verified()));

create policy "games: verified users can create as host"
  on public.games for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and status = 'open'
    and (select public.is_verified())
  );

-- game_players, attendance, reliability_events: read-only from the app.
create policy "game_players: verified users can read"
  on public.game_players for select to authenticated
  using ((select public.is_verified()));

create policy "attendance: verified users can read"
  on public.attendance for select to authenticated
  using ((select public.is_verified()));

create policy "reliability_events: verified users can read"
  on public.reliability_events for select to authenticated
  using ((select public.is_verified()));
