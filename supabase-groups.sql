-- =============================================
-- Upp — Groups System Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Groups table
create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  avatar_letter text,
  join_mode text not null default 'open' check (join_mode in ('open', 'request', 'invite')),
  members_visible boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- Group members table
create table if not exists group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamp with time zone default now(),
  unique(group_id, user_id)
);

-- Join requests table (for request-mode groups)
create table if not exists group_join_requests (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(group_id, user_id)
);

-- Add group_id to events table
alter table events add column if not exists group_id uuid references groups(id) on delete cascade;

-- =============================================
-- Row Level Security
-- =============================================

alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_join_requests enable row level security;

-- Groups: anyone can read, authenticated users can create
create policy "Groups are viewable by everyone" on groups for select using (true);
create policy "Authenticated users can create groups" on groups for insert with check (auth.uid() = created_by);
create policy "Admins can update group settings" on groups for update using (
  exists (
    select 1 from group_members
    where group_id = groups.id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
);

-- Group members: visible based on group setting or if admin
create policy "Group members viewable by all if setting allows" on group_members for select using (
  exists (
    select 1 from groups where id = group_id and members_visible = true
  )
  or
  exists (
    select 1 from group_members gm2
    where gm2.group_id = group_members.group_id
    and gm2.user_id = auth.uid()
    and gm2.role in ('owner', 'admin')
  )
  or user_id = auth.uid()
);
create policy "Users can join groups" on group_members for insert with check (auth.uid() = user_id);
create policy "Owners can manage members" on group_members for update using (
  exists (
    select 1 from group_members gm2
    where gm2.group_id = group_members.group_id
    and gm2.user_id = auth.uid()
    and gm2.role = 'owner'
  )
);
create policy "Admins and owners can remove members" on group_members for delete using (
  user_id = auth.uid()
  or
  exists (
    select 1 from group_members gm2
    where gm2.group_id = group_members.group_id
    and gm2.user_id = auth.uid()
    and gm2.role in ('owner', 'admin')
  )
);

-- Join requests
create policy "Join requests visible to admins and the requester" on group_join_requests for select using (
  user_id = auth.uid()
  or
  exists (
    select 1 from group_members
    where group_id = group_join_requests.group_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
);
create policy "Users can request to join" on group_join_requests for insert with check (auth.uid() = user_id);
create policy "Admins and requesters can delete requests" on group_join_requests for delete using (
  user_id = auth.uid()
  or
  exists (
    select 1 from group_members
    where group_id = group_join_requests.group_id
    and user_id = auth.uid()
    and role in ('owner', 'admin')
  )
);
