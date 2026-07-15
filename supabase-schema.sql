-- =============================================
-- Upp — Supabase Database Schema
-- Run this entire file in Supabase SQL Editor
-- =============================================

-- Profiles table (extends Supabase auth)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  email text,
  bio text,
  created_at timestamp with time zone default now()
);

-- Events table
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  location_name text not null,
  lat double precision,
  lng double precision,
  event_date timestamp with time zone not null,
  category text default 'Social',
  created_at timestamp with time zone default now()
);

-- Attendees table (who is going to which event)
create table if not exists attendees (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references events(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now(),
  unique(event_id, user_id)
);

-- =============================================
-- Row Level Security (RLS) — keeps data safe
-- =============================================

alter table profiles enable row level security;
alter table events enable row level security;
alter table attendees enable row level security;

-- Profiles: anyone can read, only owner can update
create policy "Profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

-- Events: anyone logged in can read, only owner can delete
create policy "Events are viewable by everyone" on events for select using (true);
create policy "Authenticated users can create events" on events for insert with check (auth.uid() = user_id);
create policy "Event owners can update their events" on events for update using (auth.uid() = user_id);
create policy "Event owners can delete their events" on events for delete using (auth.uid() = user_id);

-- Attendees: anyone can read, users manage their own
create policy "Attendees are viewable by everyone" on attendees for select using (true);
create policy "Users can add themselves as attendees" on attendees for insert with check (auth.uid() = user_id);
create policy "Users can remove themselves as attendees" on attendees for delete using (auth.uid() = user_id);
