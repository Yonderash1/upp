-- =============================================
-- Upp — Announcements + Group Delete Fix
-- Run in Supabase SQL Editor
-- =============================================

-- Announcements table
create table if not exists announcements (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  body text not null,
  image_url text,
  created_at timestamp with time zone default now()
);

alter table announcements enable row level security;

create policy "Announcements are viewable by everyone"
  on announcements for select using (true);

create policy "Admins can create announcements"
  on announcements for insert with check (
    exists (
      select 1 from group_members
      where group_id = announcements.group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

create policy "Admins can update announcements"
  on announcements for update using (
    exists (
      select 1 from group_members
      where group_id = announcements.group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

create policy "Admins can delete announcements"
  on announcements for delete using (
    exists (
      select 1 from group_members
      where group_id = announcements.group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

-- Fix group delete: only owners can delete their group
drop policy if exists "Admins can update group settings" on groups;

create policy "Admins can update group settings"
  on groups for update using (
    exists (
      select 1 from group_members
      where group_id = groups.id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
    )
  );

create policy "Only owners can delete groups"
  on groups for delete using (
    exists (
      select 1 from group_members
      where group_id = groups.id
      and user_id = auth.uid()
      and role = 'owner'
    )
  );

-- Allow event owners/group admins to update and delete events
create policy "Event owners can update their events"
  on events for update using (auth.uid() = user_id);

create policy "Event owners can delete their events"
  on events for delete using (auth.uid() = user_id);

-- Storage bucket for announcement images (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('announcements', 'announcements', true)
-- on conflict do nothing;
