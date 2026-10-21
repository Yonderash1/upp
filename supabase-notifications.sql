-- =============================================
-- Upp — Notifications
-- Run this in Supabase SQL Editor BEFORE deploying the new code.
-- (Run supabase-event-permissions.sql first — event notifications use its visibility column.)
-- =============================================

-- 1. One row per notification, per person who receives it
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,      -- who it's for
  type text not null check (type in ('group_event', 'group_announcement', 'connection_request')),
  actor_id uuid references profiles(id) on delete set null,             -- who caused it (poster / requester)
  group_id uuid references groups(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  announcement_id uuid references announcements(id) on delete cascade,
  title text,                                                           -- title of the post
  created_at timestamptz not null default now(),
  read_at timestamptz                                                   -- null = still new
);

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

drop policy if exists "Users can view their own notifications" on notifications;
create policy "Users can view their own notifications"
  on notifications for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on notifications;
create policy "Users can update their own notifications"
  on notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on notifications;
create policy "Users can delete their own notifications"
  on notifications for delete to authenticated using (auth.uid() = user_id);
-- (No insert policy on purpose: notifications are only created by the triggers below.)

-- 2. Each person's notification settings
create table if not exists notification_settings (
  user_id uuid references profiles(id) on delete cascade primary key,
  group_posts boolean not null default true,       -- events & announcements from groups you're in
  updated_at timestamptz default now()
);

alter table notification_settings enable row level security;

drop policy if exists "Users can view their own notification settings" on notification_settings;
create policy "Users can view their own notification settings"
  on notification_settings for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can add their own notification settings" on notification_settings;
create policy "Users can add their own notification settings"
  on notification_settings for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can change their own notification settings" on notification_settings;
create policy "Users can change their own notification settings"
  on notification_settings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. New group event -> notify the group's members who are allowed to see it
--    (a problem in here must never stop the event from being posted, hence the exception block)
create or replace function notify_group_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.group_id is null then return new; end if;
  begin
    insert into notifications (user_id, type, actor_id, group_id, event_id, title)
    select gm.user_id, 'group_event', new.user_id, new.group_id, new.id, new.title
    from group_members gm
    left join notification_settings ns on ns.user_id = gm.user_id
    where gm.group_id = new.group_id
      and gm.user_id <> new.user_id
      and coalesce(ns.group_posts, true)
      and (
        'public' = any(new.visibility_access)
        or 'members' = any(new.visibility_access)
        or gm.role in ('owner', 'creator')
        or gm.role = any(new.visibility_access)
      );
  exception when others then
    raise warning 'notify_group_event failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notify_group_event_trigger on events;
create trigger notify_group_event_trigger
  after insert on events
  for each row execute function notify_group_event();

-- 4. New announcement -> notify the group's members
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
      and coalesce(ns.group_posts, true);
  exception when others then
    raise warning 'notify_group_announcement failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notify_group_announcement_trigger on announcements;
create trigger notify_group_announcement_trigger
  after insert on announcements
  for each row execute function notify_group_announcement();

-- 5. New connection request -> notify the person being asked (always, regardless of settings)
create or replace function notify_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    begin
      insert into notifications (user_id, type, actor_id)
      values (new.to_user, 'connection_request', new.from_user);
    exception when others then
      raise warning 'notify_connection_request failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_connection_request_trigger on connections;
create trigger notify_connection_request_trigger
  after insert on connections
  for each row execute function notify_connection_request();

-- A declined, cancelled or removed request takes its notification with it
create or replace function remove_connection_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from notifications
   where type = 'connection_request' and user_id = old.to_user and actor_id = old.from_user;
  return old;
end;
$$;

drop trigger if exists remove_connection_notification_trigger on connections;
create trigger remove_connection_notification_trigger
  after delete on connections
  for each row execute function remove_connection_notification();

-- 6. Requests that are already waiting get a notification too
insert into notifications (user_id, type, actor_id)
select c.to_user, 'connection_request', c.from_user
from connections c
where c.status = 'pending'
  and not exists (
    select 1 from notifications n
    where n.user_id = c.to_user and n.type = 'connection_request' and n.actor_id = c.from_user
  );

-- 7. Live updates for the bell (so the count changes without a refresh)
do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
