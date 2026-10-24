-- =============================================
-- Upp — Direct messages
-- Run this in the Supabase SQL Editor BEFORE deploying the new code.
-- =============================================

-- 1. One row per message
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id) on delete cascade not null,
  recipient_id uuid references profiles(id) on delete cascade not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,                                  -- null = recipient hasn't seen it yet
  check (sender_id <> recipient_id)
);

create index if not exists messages_pair_idx on messages (sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_idx on messages (recipient_id, created_at desc);
create index if not exists messages_unread_idx on messages (recipient_id) where read_at is null;

alter table messages enable row level security;

-- You can only read messages you sent or received
drop policy if exists "Users can read their own messages" on messages;
create policy "Users can read their own messages"
  on messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- You can only send messages as yourself
drop policy if exists "Users can send messages as themselves" on messages;
create policy "Users can send messages as themselves"
  on messages for insert to authenticated
  with check (auth.uid() = sender_id);
-- (No update/delete policies on purpose: messages can't be edited, and "read" status
--  is changed only through mark_conversation_read() below.)

-- 2. The left-hand list: one row per person you've chatted with, newest first
create or replace function my_conversations()
returns table (
  other_id uuid,
  username text,
  avatar_url text,
  last_body text,
  last_sender_id uuid,
  last_at timestamptz,
  unread_count bigint
)
language sql
stable
set search_path = public
as $$
  with mine as (
    select m.sender_id, m.body, m.created_at,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
    from messages m
    where m.sender_id = auth.uid() or m.recipient_id = auth.uid()
  ),
  latest as (
    select distinct on (other) other, body, sender_id, created_at
    from mine
    order by other, created_at desc
  ),
  unread as (
    select m.sender_id as other, count(*) as n
    from messages m
    where m.recipient_id = auth.uid() and m.read_at is null
    group by m.sender_id
  )
  select l.other, p.username, p.avatar_url, l.body, l.sender_id, l.created_at, coalesce(u.n, 0)
  from latest l
  join profiles p on p.id = l.other
  left join unread u on u.other = l.other
  order by l.created_at desc;
$$;

-- 3. Opening a chat marks what they sent you as read
create or replace function mark_conversation_read(other_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set read_at = now()
   where recipient_id = auth.uid()
     and sender_id = other_user
     and read_at is null;
$$;

grant execute on function my_conversations() to authenticated;
grant execute on function mark_conversation_read(uuid) to authenticated;

-- 4. Live updates (so new messages appear without a refresh)
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
