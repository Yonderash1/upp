-- =====================================================================
-- Upp — Settings, profile privacy, blocking and message requests
-- Run this ONCE in the Supabase SQL Editor BEFORE deploying the new code.
-- (Run all the older supabase-*.sql files first — this needs the roles,
--  notifications, messages and event-permission files to exist already.)
--
-- What this does
--   1. user_settings: each person's privacy choices (public / connections /
--      private — ALL default to private) and message-request choices.
--   2. Private interests (only the owner can ever see them).
--   3. Blocking (user_blocks) + block_user().
--   4. Message requests: first-time messages must be accepted by the
--      recipient. Enforced in the database, not just the screen.
--   5. A new group role permission: "message_members".
--   6. Secure functions the profile page uses, so private things are
--      never sent to people who aren't allowed to see them.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------
create table if not exists user_settings (
  user_id uuid references profiles(id) on delete cascade primary key,

  -- Who can see each part of the profile: 'public' | 'connections' | 'private'
  vis_first_name        text not null default 'private' check (vis_first_name        in ('public', 'connections', 'private')),
  vis_last_name         text not null default 'private' check (vis_last_name         in ('public', 'connections', 'private')),
  vis_age               text not null default 'private' check (vis_age               in ('public', 'connections', 'private')),
  vis_gender            text not null default 'private' check (vis_gender            in ('public', 'connections', 'private')),
  vis_city              text not null default 'private' check (vis_city              in ('public', 'connections', 'private')),
  vis_interests         text not null default 'private' check (vis_interests         in ('public', 'connections', 'private')),
  vis_groups            text not null default 'private' check (vis_groups            in ('public', 'connections', 'private')),
  vis_connections       text not null default 'private' check (vis_connections       in ('public', 'connections', 'private')),
  vis_events_attending  text not null default 'private' check (vis_events_attending  in ('public', 'connections', 'private')),
  vis_events_interested text not null default 'private' check (vis_events_interested in ('public', 'connections', 'private')),

  -- Who can message me, and do they have to ask first?  'none' | 'request' | 'direct'
  msg_connections text not null default 'request' check (msg_connections in ('request', 'direct')),
  msg_others      text not null default 'request' check (msg_others      in ('none', 'request', 'direct')),
  msg_admins      text not null default 'request' check (msg_admins      in ('request', 'direct')),   -- group admins can always at least request
  msg_members     text not null default 'request' check (msg_members     in ('none', 'request', 'direct')),

  updated_at timestamptz default now()
);

alter table user_settings enable row level security;

drop policy if exists "Users can view their own settings" on user_settings;
create policy "Users can view their own settings"
  on user_settings for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can add their own settings" on user_settings;
create policy "Users can add their own settings"
  on user_settings for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can change their own settings" on user_settings;
create policy "Users can change their own settings"
  on user_settings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- (Other people never read this table directly — they only get answers from the functions below.)


-- ---------------------------------------------------------------------
-- 2. Private interests (same idea as interests, but only the owner can see them)
-- ---------------------------------------------------------------------
create table if not exists profile_private_label_assignments (
  user_id uuid references profiles(id) on delete cascade not null,
  label_id uuid references group_labels(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, label_id)
);

alter table profile_private_label_assignments enable row level security;

drop policy if exists "Users can view their own private interests" on profile_private_label_assignments;
create policy "Users can view their own private interests"
  on profile_private_label_assignments for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can add their own private interests" on profile_private_label_assignments;
create policy "Users can add their own private interests"
  on profile_private_label_assignments for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own private interests" on profile_private_label_assignments;
create policy "Users can remove their own private interests"
  on profile_private_label_assignments for delete to authenticated using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 3. Blocking
-- ---------------------------------------------------------------------
create table if not exists user_blocks (
  blocker_id uuid references profiles(id) on delete cascade not null,
  blocked_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table user_blocks enable row level security;

drop policy if exists "Users can view who they blocked" on user_blocks;
create policy "Users can view who they blocked"
  on user_blocks for select to authenticated using (auth.uid() = blocker_id);

drop policy if exists "Users can unblock people" on user_blocks;
create policy "Users can unblock people"
  on user_blocks for delete to authenticated using (auth.uid() = blocker_id);
-- (No insert policy on purpose: blocking goes through block_user() below so it can tidy up.)


-- ---------------------------------------------------------------------
-- 4. Small helpers (internal — not callable from the browser)
-- ---------------------------------------------------------------------
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from connections c
     where c.status = 'accepted'
       and ((c.from_user = a and c.to_user = b) or (c.from_user = b and c.to_user = a))
  );
$$;

-- 'public' | 'connections' | 'private' for one part of someone's profile (private if they never chose)
create or replace function public.privacy_level(p_owner uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select to_jsonb(s) ->> ('vis_' || p_key) from user_settings s where s.user_id = p_owner),
    'private'
  );
$$;

-- May the person asking (auth.uid()) see this part of p_owner's profile?
create or replace function public.can_see(p_owner uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() = p_owner then true
    when public.privacy_level(p_owner, p_key) = 'public' then true
    when public.privacy_level(p_owner, p_key) = 'connections' then public.are_connected(auth.uid(), p_owner)
    else false
  end;
$$;

create or replace function public.mode_rank(m text)
returns integer
language sql
immutable
as $$
  select case m when 'direct' then 2 when 'request' then 1 else 0 end;
$$;


-- ---------------------------------------------------------------------
-- 5. Group role permission: message_members
-- ---------------------------------------------------------------------
create or replace function public.all_group_permissions()
returns text[]
language sql
immutable
as $$
  select array[
    'create_events', 'edit_events', 'delete_events',
    'create_announcements', 'edit_announcements', 'delete_announcements',
    'kick_members', 'manage_roles', 'manage_join_requests', 'manage_group',
    'create_channels', 'edit_channels', 'delete_channels',
    'message_members'
  ]::text[];
$$;

-- Everyone can message each other today, so every existing role keeps that ability
update group_roles
   set permissions = array_append(permissions, 'message_members')
 where not is_owner
   and not ('message_members' = any(permissions));

-- New groups: Admin gets it automatically (it has everything except manage_roles); Member gets it too
create or replace function public.create_default_group_roles(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into group_roles (group_id, name, color, rank, permissions, is_owner, is_default) values
    (p_group, 'Owner',  '#f39c12', 0, '{}', true,  false),
    (p_group, 'Admin',  '#9b59b6', 1, array_remove(public.all_group_permissions(), 'manage_roles'), false, false),
    (p_group, 'Member', '#99aab5', 2, array['message_members'], false, true)
  on conflict do nothing;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Messages: requests, and who can message whom
-- ---------------------------------------------------------------------
alter table messages add column if not exists is_request boolean not null default false;
-- true  = a first message waiting for the recipient to accept (the recipient can't see it yet)
-- false = a normal message

-- The recipient only sees messages that aren't waiting on a request
drop policy if exists "Users can read their own messages" on messages;
create policy "Users can read their own messages"
  on messages for select to authenticated
  using (
    auth.uid() = sender_id
    or (auth.uid() = recipient_id and not is_request)
  );

-- How can p_sender message p_recipient?  'blocked' | 'none' | 'request' | 'direct'
--   Groups: a sender only counts as a group admin / fellow member if their ROLE has the
--   "message_members" permission. "Admin" = the Owner, or anyone who can kick, manage roles,
--   approve join requests or manage the group. If more than one thing applies to the sender,
--   the most open setting wins.
create or replace function public.message_mode(p_sender uuid, p_recipient uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s_conn text; s_others text; s_admins text; s_members text;
  best integer := 0;
  g_admin boolean; g_member boolean;
begin
  if exists (
    select 1 from user_blocks
     where (blocker_id = p_sender and blocked_id = p_recipient)
        or (blocker_id = p_recipient and blocked_id = p_sender)
  ) then
    return 'blocked';
  end if;

  select msg_connections, msg_others, msg_admins, msg_members
    into s_conn, s_others, s_admins, s_members
    from user_settings where user_id = p_recipient;

  s_conn    := coalesce(s_conn,    'request');
  s_others  := coalesce(s_others,  'request');
  s_admins  := coalesce(s_admins,  'request');
  s_members := coalesce(s_members, 'request');

  if public.are_connected(p_sender, p_recipient) then
    best := public.mode_rank(s_conn);
  else
    best := public.mode_rank(s_others);
  end if;

  select coalesce(bool_or(r.is_owner or r.permissions && array['kick_members', 'manage_roles', 'manage_join_requests', 'manage_group']), false),
         count(*) > 0
    into g_admin, g_member
    from group_members gs
    join group_roles r on r.id = gs.role_id
    join group_members gr on gr.group_id = gs.group_id and gr.user_id = p_recipient
   where gs.user_id = p_sender
     and (r.is_owner or 'message_members' = any(r.permissions));

  if g_admin then
    best := greatest(best, public.mode_rank(s_admins));
  elsif g_member then
    best := greatest(best, public.mode_rank(s_members));
  end if;

  return case best when 2 then 'direct' when 1 then 'request' else 'none' end;
end;
$$;

-- What's the state of the conversation between two people?
--   open        – can chat freely
--   request     – nothing sent yet; the first message will go out as a request
--   pending     – I sent a request, waiting for them to accept
--   incoming    – they sent ME a request that I haven't accepted
--   none        – they don't accept messages from me
--   blocked     – they blocked me          you_blocked – I blocked them
create or replace function public.conversation_state_for(p_me uuid, p_other uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare m text;
begin
  if exists (select 1 from user_blocks where blocker_id = p_me and blocked_id = p_other) then return 'you_blocked'; end if;
  if exists (select 1 from user_blocks where blocker_id = p_other and blocked_id = p_me) then return 'blocked'; end if;

  if exists (select 1 from messages where sender_id = p_other and recipient_id = p_me and is_request) then return 'incoming'; end if;

  -- Once either of you has had a normal message through, it's a normal conversation
  if exists (
    select 1 from messages
     where not is_request
       and ((sender_id = p_me and recipient_id = p_other) or (sender_id = p_other and recipient_id = p_me))
  ) then return 'open'; end if;

  if exists (select 1 from messages where sender_id = p_me and recipient_id = p_other and is_request) then return 'pending'; end if;

  m := public.message_mode(p_me, p_other);
  return case m when 'direct' then 'open' when 'request' then 'request' else 'none' end;
end;
$$;

create or replace function public.conversation_state(p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.conversation_state_for(auth.uid(), p_other);
$$;

-- Every new message goes through these rules (the screen is just a friendly front for this)
create or replace function public.enforce_message_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare st text;
begin
  st := public.conversation_state_for(new.sender_id, new.recipient_id);
  if st = 'you_blocked' then raise exception 'You''ve blocked this person. Unblock them to send a message.'; end if;
  if st in ('blocked', 'none') then raise exception 'This person isn''t accepting messages from you.'; end if;
  if st = 'incoming' then raise exception 'Accept their message request to reply.'; end if;
  if st = 'pending' then raise exception 'Your message request is still waiting to be accepted.'; end if;
  new.is_request := (st = 'request');
  return new;
end;
$$;

drop trigger if exists enforce_message_rules_trigger on messages;
create trigger enforce_message_rules_trigger
  before insert on messages
  for each row execute function public.enforce_message_rules();

-- A request lands in the recipient's notifications
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('group_event', 'group_announcement', 'connection_request',
                  'group_deleted', 'event_deleted', 'event_changed', 'message_request'));

create or replace function public.notify_message_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_request then
    begin
      if not exists (
        select 1 from notifications
         where user_id = new.recipient_id and type = 'message_request' and actor_id = new.sender_id
      ) then
        insert into notifications (user_id, type, actor_id) values (new.recipient_id, 'message_request', new.sender_id);
      end if;
    exception when others then
      raise warning 'notify_message_request failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_message_request_trigger on messages;
create trigger notify_message_request_trigger
  after insert on messages
  for each row execute function public.notify_message_request();

-- Accept: their waiting message(s) become normal, visible messages
create or replace function public.accept_message_request(p_sender uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from user_blocks
     where (blocker_id = auth.uid() and blocked_id = p_sender)
        or (blocker_id = p_sender and blocked_id = auth.uid())
  ) then
    raise exception 'You can''t accept a request from this person.';
  end if;

  update messages set is_request = false
   where sender_id = p_sender and recipient_id = auth.uid() and is_request;
end;
$$;

-- Who has a request waiting for me? (I can't read the waiting messages themselves)
create or replace function public.my_pending_message_requests()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct sender_id from messages where recipient_id = auth.uid() and is_request;
$$;

-- "Read" only applies to messages I'm actually allowed to see
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
     and not is_request
     and read_at is null;
$$;

-- The chat list hides people I've blocked
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
    where not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = mine.other)
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


-- ---------------------------------------------------------------------
-- 7. Blocking (tidies up connections and waiting requests too)
-- ---------------------------------------------------------------------
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user = auth.uid() then raise exception 'You can''t block yourself.'; end if;

  insert into user_blocks (blocker_id, blocked_id) values (auth.uid(), p_user)
  on conflict do nothing;

  delete from connections
   where (from_user = auth.uid() and to_user = p_user)
      or (from_user = p_user and to_user = auth.uid());

  delete from messages where sender_id = p_user and recipient_id = auth.uid() and is_request;
  delete from notifications where user_id = auth.uid() and type = 'message_request' and actor_id = p_user;
end;
$$;

-- Blocked people (either way round) can't send connection requests
create or replace function public.block_connection_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from user_blocks
     where (blocker_id = new.from_user and blocked_id = new.to_user)
        or (blocker_id = new.to_user and blocked_id = new.from_user)
  ) then
    raise exception 'You can''t connect with this person.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_connection_requests_trigger on connections;
create trigger block_connection_requests_trigger
  before insert on connections
  for each row execute function public.block_connection_requests();


-- ---------------------------------------------------------------------
-- 8. Profile page functions — they only ever return what the viewer may see
-- ---------------------------------------------------------------------

-- The profile header + About fields. "hidden" lists what the viewer isn't allowed to see.
create or replace function public.get_profile_view(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles;
  k text;
  hidden text[] := '{}';
  result jsonb;
begin
  select * into p from profiles where id = p_user;
  if not found then return null; end if;

  result := jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url);

  foreach k in array array['first_name', 'last_name', 'age', 'gender', 'city'] loop
    if public.can_see(p_user, k) then
      result := result || jsonb_build_object(k, to_jsonb(p) -> k);
    else
      hidden := array_append(hidden, k);
    end if;
  end loop;

  result := result || jsonb_build_object('hidden', to_jsonb(hidden));

  -- Only the owner gets the exact home-town position
  if auth.uid() = p_user then
    result := result || jsonb_build_object('city_lat', p.city_lat, 'city_lng', p.city_lng);
  end if;

  return result;
end;
$$;

create or replace function public.profile_interests_view(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see(p_user, 'interests') then
    return jsonb_build_object('visible', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('visible', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', gl.id, 'name', gl.name) order by gl.name)
      from profile_label_assignments a
      join group_labels gl on gl.id = a.label_id
     where a.user_id = p_user
  ), '[]'::jsonb));
end;
$$;

-- Groups: respects the person's setting AND each group's own "members visible" switch
create or replace function public.profile_groups_view(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see(p_user, 'groups') then
    return jsonb_build_object('visible', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('visible', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id, 'name', g.name, 'description', g.description, 'image_url', g.image_url,
             'role_name', r.name, 'role_color', r.color, 'is_owner', r.is_owner
           ) order by gm.joined_at)
      from group_members gm
      join groups g on g.id = gm.group_id
      join group_roles r on r.id = gm.role_id
     where gm.user_id = p_user
       and (
         auth.uid() = p_user
         or g.members_visible
         or exists (select 1 from group_members v where v.group_id = g.id and v.user_id = auth.uid())
       )
  ), '[]'::jsonb));
end;
$$;

create or replace function public.profile_connections_view(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see(p_user, 'connections') then
    return jsonb_build_object('visible', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object('visible', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'avatar_url', p.avatar_url) order by p.username)
      from connections c
      join profiles p on p.id = case when c.from_user = p_user then c.to_user else c.from_user end
     where c.status = 'accepted'
       and (c.from_user = p_user or c.to_user = p_user)
  ), '[]'::jsonb));
end;
$$;

-- Events someone is going to / interested in — also respects each event's own visibility
create or replace function public.profile_events_view(p_user uuid, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare items jsonb;
begin
  if p_kind not in ('attending', 'interested') then raise exception 'Unknown list'; end if;

  if not public.can_see(p_user, 'events_' || p_kind) then
    return jsonb_build_object('visible', false, 'items', '[]'::jsonb);
  end if;

  if p_kind = 'attending' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'title', e.title, 'event_date', e.event_date, 'event_end', e.event_end,
             'location_name', e.location_name, 'location_type', e.location_type,
             'group_id', e.group_id, 'group_name', g.name
           ) order by e.event_date), '[]'::jsonb)
      into items
      from attendees a
      join events e on e.id = a.event_id
      left join groups g on g.id = e.group_id
     where a.user_id = p_user
       and (e.user_id = auth.uid()
            or public.audience_status(e.group_id, e.visibility_access, e.visibility_min_role, auth.uid()) = 'ok');
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'title', e.title, 'event_date', e.event_date, 'event_end', e.event_end,
             'location_name', e.location_name, 'location_type', e.location_type,
             'group_id', e.group_id, 'group_name', g.name
           ) order by e.event_date), '[]'::jsonb)
      into items
      from event_interests i
      join events e on e.id = i.event_id
      left join groups g on g.id = e.group_id
     where i.user_id = p_user
       and not exists (select 1 from attendees a where a.event_id = e.id and a.user_id = p_user)
       and (e.user_id = auth.uid()
            or public.audience_status(e.group_id, e.visibility_access, e.visibility_min_role, auth.uid()) = 'ok');
  end if;

  return jsonb_build_object('visible', true, 'items', items);
end;
$$;


-- ---------------------------------------------------------------------
-- 9. Who may call what
--    The browser can only call the functions it needs; the internal ones
--    (which could be used to peek at other people's settings) are locked.
-- ---------------------------------------------------------------------
revoke execute on function public.are_connected(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.privacy_level(uuid, text) from public, anon, authenticated;
revoke execute on function public.can_see(uuid, text) from public, anon, authenticated;
revoke execute on function public.message_mode(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.conversation_state_for(uuid, uuid) from public, anon, authenticated;

grant execute on function public.conversation_state(uuid) to authenticated;
grant execute on function public.accept_message_request(uuid) to authenticated;
grant execute on function public.my_pending_message_requests() to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.get_profile_view(uuid) to authenticated;
grant execute on function public.profile_interests_view(uuid) to authenticated;
grant execute on function public.profile_groups_view(uuid) to authenticated;
grant execute on function public.profile_connections_view(uuid) to authenticated;
grant execute on function public.profile_events_view(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;

notify pgrst, 'reload schema';
