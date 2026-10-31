-- =============================================
-- Upp — New event form: end time, location types, labels
-- Run this in Supabase SQL Editor BEFORE deploying the new code
-- =============================================

-- 1. New event columns
alter table events add column if not exists event_end timestamptz;
alter table events add column if not exists location_type text not null default 'physical';
alter table events add column if not exists location_details text;

alter table events drop constraint if exists events_location_type_check;
alter table events add constraint events_location_type_check
  check (location_type in ('physical', 'tbc', 'online', 'other'));

-- An event must finish after it starts and can run for at most a year
-- (one extra day of slack so time zones can never cause a false rejection)
alter table events drop constraint if exists events_duration_check;
alter table events add constraint events_duration_check
  check (event_end is null or (event_end > event_date and event_end <= event_date + interval '1 year 1 day'));

-- 2. Labels on events (re-uses the same label pool as groups and profiles)
create table if not exists event_label_assignments (
  event_id uuid references events(id) on delete cascade not null,
  label_id uuid references group_labels(id) on delete cascade not null,
  primary key (event_id, label_id)
);

alter table event_label_assignments enable row level security;

drop policy if exists "Event labels are viewable by everyone" on event_label_assignments;
create policy "Event labels are viewable by everyone"
  on event_label_assignments for select using (true);

drop policy if exists "Event owners and group admins can add event labels" on event_label_assignments;
create policy "Event owners and group admins can add event labels"
  on event_label_assignments for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = event_label_assignments.event_id
        and (
          e.user_id = auth.uid()
          or exists (
            select 1 from group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = auth.uid()
              and gm.role in ('owner', 'admin')
          )
        )
    )
  );

drop policy if exists "Event owners and group admins can remove event labels" on event_label_assignments;
create policy "Event owners and group admins can remove event labels"
  on event_label_assignments for delete to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = event_label_assignments.event_id
        and (
          e.user_id = auth.uid()
          or exists (
            select 1 from group_members gm
            where gm.group_id = e.group_id
              and gm.user_id = auth.uid()
              and gm.role in ('owner', 'admin')
          )
        )
    )
  );

-- Maximum of 5 labels per event
create or replace function enforce_event_label_limit() returns trigger as $$
begin
  if (select count(*) from event_label_assignments where event_id = new.event_id) >= 5 then
    raise exception 'An event can have at most 5 labels';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists event_label_limit on event_label_assignments;
create trigger event_label_limit
  before insert on event_label_assignments
  for each row execute function enforce_event_label_limit();

-- 3. Let group admins edit/delete events posted in their group
--    (before this, only the admin who created an event could edit it)
drop policy if exists "Group admins can update group events" on events;
create policy "Group admins can update group events"
  on events for update to authenticated
  using (
    group_id is not null and exists (
      select 1 from group_members gm
      where gm.group_id = events.group_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );

drop policy if exists "Group admins can delete group events" on events;
create policy "Group admins can delete group events"
  on events for delete to authenticated
  using (
    group_id is not null and exists (
      select 1 from group_members gm
      where gm.group_id = events.group_id
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );

-- Announcements already have an admin "update" policy, so editing them needs no changes.
