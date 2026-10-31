-- =============================================
-- Upp — Event permissions: attendee limit, who can join, who can see, "I'm interested"
-- Run this in Supabase SQL Editor BEFORE deploying the new code
-- (run supabase-event-form.sql first if you haven't already)
-- =============================================

-- 1. New event columns. Existing events stay open to, and visible to, everyone.
alter table events add column if not exists max_attendees integer;
alter table events add column if not exists join_access text[] not null default array['public'];
alter table events add column if not exists visibility_access text[] not null default array['public'];

alter table events drop constraint if exists events_max_attendees_check;
alter table events add constraint events_max_attendees_check
  check (max_attendees is null or max_attendees between 1 and 100000);

-- Each access list is: {public}, {members}, or a list of roles like {owner,admin}
alter table events drop constraint if exists events_join_access_check;
alter table events add constraint events_join_access_check check (
  cardinality(join_access) between 1 and 4
  and join_access <@ array['public', 'members', 'owner', 'admin']
  and (cardinality(join_access) = 1 or not (join_access && array['public', 'members']))
);

alter table events drop constraint if exists events_visibility_access_check;
alter table events add constraint events_visibility_access_check check (
  cardinality(visibility_access) between 1 and 4
  and visibility_access <@ array['public', 'members', 'owner', 'admin']
  and (cardinality(visibility_access) = 1 or not (visibility_access && array['public', 'members']))
);

-- 2. Who can SEE an event.
--    Visible if: not in a group, set to public, you created it, you're the group's owner,
--    or you're a member whose role is allowed.
drop policy if exists "Events are viewable by everyone" on events;
drop policy if exists "Events respect visibility" on events;
create policy "Events respect visibility"
  on events for select
  using (
    group_id is null
    or 'public' = any(visibility_access)
    or user_id = auth.uid()
    or exists (
      select 1 from group_members gm
      where gm.group_id = events.group_id
        and gm.user_id = auth.uid()
        and (
          gm.role in ('owner', 'creator')
          or 'members' = any(visibility_access)
          or gm.role = any(visibility_access)
        )
    )
  );

-- 3. Who can JOIN an event: works out 'ok', 'non_member' or 'wrong_role'
create or replace function event_join_status(p_event uuid, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev_group uuid;
  ev_access text[];
  member_role text;
begin
  select group_id, join_access into ev_group, ev_access from events where id = p_event;
  if not found then return 'missing'; end if;
  if ev_group is null or 'public' = any(ev_access) then return 'ok'; end if;

  select case when role = 'creator' then 'owner' else role end
    into member_role
    from group_members
    where group_id = ev_group and user_id = p_user;

  if member_role is null then return 'non_member'; end if;
  if 'members' = any(ev_access) or member_role = any(ev_access) then return 'ok'; end if;
  return 'wrong_role';
end;
$$;

-- 4. Enforce the join rules and the attendee limit when someone confirms attendance
create or replace function enforce_event_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  join_status text;
  cap integer;
  taken integer;
begin
  -- Lock the event row so two people can't grab the last spot at the same moment
  select max_attendees into cap from events where id = new.event_id for update;

  join_status := event_join_status(new.event_id, new.user_id);
  if join_status = 'non_member' then raise exception 'Unavailable to non-members'; end if;
  if join_status = 'wrong_role' then raise exception 'Unavailable to your group role'; end if;

  if cap is not null then
    select count(*) into taken from attendees where event_id = new.event_id;
    if taken >= cap then raise exception 'This event is full'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_attendance_trigger on attendees;
create trigger enforce_event_attendance_trigger
  before insert on attendees
  for each row execute function enforce_event_attendance();

-- 5. "I'm interested" — people who want to come but haven't confirmed
create table if not exists event_interests (
  event_id uuid references events(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);

alter table event_interests enable row level security;

drop policy if exists "Interest is viewable by everyone" on event_interests;
create policy "Interest is viewable by everyone"
  on event_interests for select using (true);

drop policy if exists "Users can mark themselves interested" on event_interests;
create policy "Users can mark themselves interested"
  on event_interests for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own interest" on event_interests;
create policy "Users can remove their own interest"
  on event_interests for delete to authenticated
  using (auth.uid() = user_id);

-- Only people the event is open to can be interested (a full event still allows interest)
create or replace function enforce_event_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  join_status text;
begin
  join_status := event_join_status(new.event_id, new.user_id);
  if join_status = 'non_member' then raise exception 'Unavailable to non-members'; end if;
  if join_status = 'wrong_role' then raise exception 'Unavailable to your group role'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_interest_trigger on event_interests;
create trigger enforce_event_interest_trigger
  before insert on event_interests
  for each row execute function enforce_event_interest();

-- 6. Make the API pick up the new columns straight away
notify pgrst, 'reload schema';
