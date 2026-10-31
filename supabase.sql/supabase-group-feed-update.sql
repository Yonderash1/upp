-- =============================================
-- Upp — Group feed update
--   * distance unit preference (km / miles)
--   * who can see an announcement
--   * notifications: group deleted, event deleted, event changed
-- Run this in the Supabase SQL Editor BEFORE deploying the new code.
-- (Run after supabase-notifications.sql and supabase-roles-channels.sql.)
-- =============================================

-- 1. Distance unit preference (default kilometres)
alter table profiles add column if not exists distance_unit text not null default 'km';
alter table profiles drop constraint if exists profiles_distance_unit_check;
alter table profiles add constraint profiles_distance_unit_check check (distance_unit in ('km', 'mi'));

-- 2. Announcement audience: who can see it (same model as events)
--    Announcements that already exist stay visible to everyone; new ones default to members only.
alter table announcements add column if not exists visibility_access text[] not null default array['public'];
alter table announcements add column if not exists visibility_min_role uuid;
alter table announcements alter column visibility_access set default array['members'];

alter table announcements drop constraint if exists announcements_visibility_min_role_fkey;
alter table announcements add constraint announcements_visibility_min_role_fkey
  foreign key (visibility_min_role) references group_roles(id) on delete set null;

alter table announcements drop constraint if exists announcements_visibility_access_check;
alter table announcements add constraint announcements_visibility_access_check
  check (cardinality(visibility_access) = 1 and visibility_access <@ array['public', 'members', 'role']);

drop policy if exists "Announcements are viewable by everyone" on announcements;
drop policy if exists "Announcements respect visibility" on announcements;
create policy "Announcements respect visibility"
  on announcements for select
  using (
    user_id = auth.uid()
    or public.has_group_perm(group_id, 'edit_announcements')
    or public.has_group_perm(group_id, 'delete_announcements')
    or public.audience_status(group_id, visibility_access, visibility_min_role, auth.uid()) = 'ok'
  );

-- New announcement -> notify only the members who are allowed to see it
create or replace function notify_group_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into notifications (user_id, type, actor_id, group_id, announcement_id, title)
    select gm.user_id, 'group_announcement', new.user_id, new.group_id, new.id, new.title
    from group_members gm
    left join notification_settings ns on ns.user_id = gm.user_id
    where gm.group_id = new.group_id
      and gm.user_id <> new.user_id
      and coalesce(ns.group_posts, true)
      and public.audience_status(new.group_id, new.visibility_access, new.visibility_min_role, gm.user_id) = 'ok';
  exception when others then
    raise warning 'notify_group_announcement failed: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 3. New notification types and columns
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('group_event', 'group_announcement', 'connection_request',
                  'group_deleted', 'event_deleted', 'event_changed'));

alter table notifications add column if not exists group_name text;   -- kept so it still reads right after the group is gone
alter table notifications add column if not exists changes text[];    -- event_changed: what was changed
alter table notifications add column if not exists detail text;       -- event_deleted: 'attending' | 'interested'

-- 4. Group deleted -> tell every other member.
--    (These rows deliberately have no group_id, so they survive the group being deleted.)
create or replace function notify_group_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    -- remembered for the rest of this transaction so the group's events know why they're going
    perform set_config('upp.deleting_group', old.id::text, true);
    perform set_config('upp.deleting_group_name', old.name, true);

    insert into notifications (user_id, type, actor_id, group_name, title)
    select gm.user_id, 'group_deleted', auth.uid(), old.name, old.name
    from group_members gm
    where gm.group_id = old.id
      and gm.user_id is distinct from auth.uid();
  exception when others then
    raise warning 'notify_group_deleted failed: %', sqlerrm;
  end;
  return old;
end;
$$;

drop trigger if exists notify_group_deleted_trigger on groups;
create trigger notify_group_deleted_trigger
  before delete on groups
  for each row execute function notify_group_deleted();

-- 5. Event deleted (on its own, or because its group was) -> tell everyone going or interested
create or replace function notify_event_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gname text;
begin
  begin
    if old.group_id is not null then
      if current_setting('upp.deleting_group', true) = old.group_id::text then
        gname := current_setting('upp.deleting_group_name', true);
      else
        select name into gname from groups where id = old.group_id;
      end if;
    end if;

    insert into notifications (user_id, type, actor_id, group_name, title, detail)
    select u.user_id, 'event_deleted', auth.uid(), gname, old.title, u.kind
    from (
      select a.user_id, 'attending'::text as kind
        from attendees a where a.event_id = old.id
      union all
      select i.user_id, 'interested'::text
        from event_interests i
       where i.event_id = old.id
         and not exists (select 1 from attendees a2 where a2.event_id = old.id and a2.user_id = i.user_id)
    ) u
    where u.user_id is distinct from auth.uid();
  exception when others then
    raise warning 'notify_event_deleted failed: %', sqlerrm;
  end;
  return old;
end;
$$;

drop trigger if exists notify_event_deleted_trigger on events;
create trigger notify_event_deleted_trigger
  before delete on events
  for each row execute function notify_event_deleted();

-- 6. Event changed -> tell the people who are GOING (not just interested).
--    One notification per save, listing every category that changed.
create or replace function notify_event_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changes text[] := '{}';
  gname text;
begin
  begin
    if new.title is distinct from old.title then
      changes := changes || 'Event name changed';
    end if;

    if new.event_date is distinct from old.event_date
       or (old.event_end is not null and new.event_end is distinct from old.event_end) then
      changes := changes || 'Date/time changed';
    end if;

    if new.location_type is distinct from old.location_type then
      changes := changes || case new.location_type
        when 'online'   then 'Changed to an online event'
        when 'tbc'      then 'Location to be confirmed'
        when 'physical' then 'Changed to a location with a map pin'
        else                 'Changed to a location without a map pin'
      end;
    else
      if new.location_type = 'physical'
         and (new.lat is distinct from old.lat or new.lng is distinct from old.lng) then
        changes := changes || 'Map position changed';
      end if;
      if new.location_type in ('physical', 'other')
         and new.location_name is distinct from old.location_name then
        changes := changes || 'Location name changed';
      end if;
      if new.location_type in ('online', 'other')
         and new.location_details is distinct from old.location_details then
        changes := changes || 'Location details changed';
      end if;
    end if;

    if new.description is distinct from old.description then
      changes := changes || 'Description changed';
    end if;
    if new.max_attendees is distinct from old.max_attendees then
      changes := changes || 'Attendee limit changed';
    end if;
    if new.join_access is distinct from old.join_access
       or new.join_min_role is distinct from old.join_min_role then
      changes := changes || 'Who can join changed';
    end if;
    if new.visibility_access is distinct from old.visibility_access
       or new.visibility_min_role is distinct from old.visibility_min_role then
      changes := changes || 'Event visibility changed';
    end if;

    if array_length(changes, 1) is null then return new; end if;

    if new.group_id is not null then
      select name into gname from groups where id = new.group_id;
    end if;

    insert into notifications (user_id, type, actor_id, group_id, event_id, group_name, title, changes)
    select a.user_id, 'event_changed', auth.uid(), new.group_id, new.id, gname, new.title, changes
    from attendees a
    where a.event_id = new.id
      and a.user_id is distinct from auth.uid();
  exception when others then
    raise warning 'notify_event_changed failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notify_event_changed_trigger on events;
create trigger notify_event_changed_trigger
  after update on events
  for each row execute function notify_event_changed();

-- 7. Labels live in their own table, so the form calls this after saving labels.
--    It adds "Labels changed" to the notification the same save just made (or makes one).
create or replace function public.notify_event_labels_changed(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev events;
  gname text;
begin
  select * into ev from events where id = p_event;
  if not found then return; end if;

  if not (
    (ev.group_id is null and ev.user_id = auth.uid())
    or (ev.group_id is not null and public.has_group_perm(ev.group_id, 'edit_events'))
  ) then
    raise exception 'You do not have permission to edit this event';
  end if;

  update notifications n
     set changes = array_append(n.changes, 'Labels changed'), read_at = null
   where n.type = 'event_changed'
     and n.event_id = p_event
     and n.actor_id = auth.uid()
     and n.created_at > now() - interval '2 minutes'
     and not ('Labels changed' = any(coalesce(n.changes, '{}')));

  if ev.group_id is not null then
    select name into gname from groups where id = ev.group_id;
  end if;

  insert into notifications (user_id, type, actor_id, group_id, event_id, group_name, title, changes)
  select a.user_id, 'event_changed', auth.uid(), ev.group_id, ev.id, gname, ev.title, array['Labels changed']
  from attendees a
  where a.event_id = p_event
    and a.user_id is distinct from auth.uid()
    and not exists (
      select 1 from notifications n
       where n.type = 'event_changed' and n.event_id = p_event and n.user_id = a.user_id
         and n.actor_id = auth.uid() and n.created_at > now() - interval '2 minutes'
    );
end;
$$;

grant execute on function public.notify_event_labels_changed(uuid) to authenticated;

notify pgrst, 'reload schema';
