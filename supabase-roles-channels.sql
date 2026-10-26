-- =====================================================================
-- Upp — Group roles, role hierarchy, kicking, and chat channels
-- Run this ONCE in the Supabase SQL Editor BEFORE deploying the new code.
-- (Run all the older supabase-*.sql files first if you haven't already.)
--
-- What this does
--   1. Every group gets roles stored in a table (default: Owner, Admin, Member).
--      Roles have a name, a colour and a list of permissions, and are ordered
--      top-to-bottom: a LOWER "rank" number means a HIGHER role (Owner = 0).
--   2. Existing groups and members are converted automatically.
--   3. Events: "who can join / see" now means "this role and everyone above it".
--   4. Kicking, role changes and role editing go through checked functions so a
--      lower role can never act on an equal or higher one.
--   5. Chat channels (max 4 per group) with per-channel access levels.
--   6. Limits: max 10 roles per group, max 4 channels per group.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Permission list (one place to add new permissions later)
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
    'create_channels', 'edit_channels', 'delete_channels'
  ]::text[];
$$;


-- ---------------------------------------------------------------------
-- 2. Roles table
--    rank: 0 = top (Owner). Higher number = lower in the hierarchy.
--    is_owner:   the one Owner role (all permissions, can't be deleted/moved)
--    is_default: the one base role everyone joins with (always last, can't be deleted)
-- ---------------------------------------------------------------------
create table if not exists group_roles (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  color text not null default '#99aab5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  rank integer not null check (rank >= 0),
  permissions text[] not null default '{}',
  is_owner boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz default now(),
  check (not (is_owner and is_default)),
  check (permissions <@ public.all_group_permissions())
);

create unique index if not exists group_roles_one_owner on group_roles (group_id) where is_owner;
create unique index if not exists group_roles_one_default on group_roles (group_id) where is_default;
create index if not exists group_roles_group_idx on group_roles (group_id, rank);

alter table group_roles enable row level security;

-- Roles are readable by everyone (names/colours aren't private); changes only go through the functions below
drop policy if exists "Roles are viewable by everyone" on group_roles;
create policy "Roles are viewable by everyone" on group_roles for select using (true);


-- ---------------------------------------------------------------------
-- 3. Members point at a role
-- ---------------------------------------------------------------------
alter table group_members add column if not exists role_id uuid;
alter table group_members drop constraint if exists group_members_role_check;

-- Default roles for a group (used for new groups and for converting old ones)
create or replace function public.create_default_group_roles(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into group_roles (group_id, name, color, rank, permissions, is_owner, is_default) values
    (p_group, 'Owner',  '#f39c12', 0, '{}', true,  false),
    -- Admins keep everything they could do before, except managing roles (the owner can tick that on)
    (p_group, 'Admin',  '#9b59b6', 1, array_remove(public.all_group_permissions(), 'manage_roles'), false, false),
    (p_group, 'Member', '#99aab5', 2, '{}', false, true)
  on conflict do nothing;
end;
$$;

-- Convert every existing group
select public.create_default_group_roles(g.id)
from groups g
where not exists (select 1 from group_roles r where r.group_id = g.id);

-- Convert every existing member (old role text -> new role row)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_members' and column_name = 'role'
  ) then
    update group_members gm
       set role_id = r.id
      from group_roles r
     where gm.role_id is null
       and r.group_id = gm.group_id
       and (
            (gm.role in ('owner', 'creator') and r.is_owner)
         or (gm.role = 'admin' and r.name = 'Admin' and not r.is_owner and not r.is_default)
       );
  end if;
end $$;

-- Anyone left over becomes a plain member
update group_members gm
   set role_id = r.id
  from group_roles r
 where gm.role_id is null and r.group_id = gm.group_id and r.is_default;

alter table group_members alter column role_id set not null;
alter table group_members drop constraint if exists group_members_role_id_fkey;
alter table group_members add constraint group_members_role_id_fkey
  foreign key (role_id) references group_roles(id) on delete restrict;
create index if not exists group_members_role_idx on group_members (role_id);


-- ---------------------------------------------------------------------
-- 4. Helper functions (security definer, so policies can use them without recursion)
-- ---------------------------------------------------------------------

-- The role row a user holds in a group (all-null if they aren't a member)
create or replace function public.member_role(p_group uuid, p_user uuid default auth.uid())
returns public.group_roles
language sql
stable
security definer
set search_path = public
as $$
  select r.*
    from group_members gm
    join group_roles r on r.id = gm.role_id
   where gm.group_id = p_group and gm.user_id = p_user;
$$;

create or replace function public.member_rank(p_group uuid, p_user uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select r.rank
    from group_members gm
    join group_roles r on r.id = gm.role_id
   where gm.group_id = p_group and gm.user_id = p_user;
$$;

create or replace function public.role_rank(p_role uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select rank from group_roles where id = p_role;
$$;

-- Does this person hold a permission in this group? (The Owner role always does.)
create or replace function public.has_group_perm(p_group uuid, p_perm text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select r.is_owner or p_perm = any(r.permissions)
      from group_members gm
      join group_roles r on r.id = gm.role_id
     where gm.group_id = p_group and gm.user_id = p_user
  ), false);
$$;

-- THE HIERARCHY RULE: is the actor strictly higher than the target?
-- (Someone who has left the group counts as lowest of all.)
create or replace function public.outranks(p_group uuid, p_actor uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_rank(p_group, p_actor) is not null
     and public.member_rank(p_group, p_actor) < coalesce(public.member_rank(p_group, p_target), 2147483647);
$$;


-- ---------------------------------------------------------------------
-- 5. Members: always get a valid role, new groups get default roles
-- ---------------------------------------------------------------------
create or replace function public.group_member_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is null then
    select id into new.role_id from group_roles where group_id = new.group_id and is_default;
  end if;
  if not exists (select 1 from group_roles where id = new.role_id and group_id = new.group_id) then
    raise exception 'That role does not belong to this group';
  end if;
  return new;
end;
$$;

drop trigger if exists group_member_defaults_trigger on group_members;
create trigger group_member_defaults_trigger
  before insert or update of role_id, group_id on group_members
  for each row execute function public.group_member_defaults();

-- Replaces the old "add creator with role 'creator'" trigger
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_default_group_roles(new.id);
  if new.created_by is not null then
    insert into group_members (group_id, user_id, role_id)
    select new.id, new.created_by, r.id
      from group_roles r
     where r.group_id = new.id and r.is_owner;
  end if;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute procedure public.handle_new_group();


-- ---------------------------------------------------------------------
-- 6. Events: "role and everyone above it"
--    join_access / visibility_access are now one of {public}, {members}, {role}.
--    With {role}, join_min_role / visibility_min_role names the lowest role allowed in.
-- ---------------------------------------------------------------------
alter table events drop constraint if exists events_join_access_check;
alter table events drop constraint if exists events_visibility_access_check;

alter table events add column if not exists join_min_role uuid;
alter table events add column if not exists visibility_min_role uuid;

alter table events drop constraint if exists events_join_min_role_fkey;
alter table events add constraint events_join_min_role_fkey
  foreign key (join_min_role) references group_roles(id) on delete set null;
alter table events drop constraint if exists events_visibility_min_role_fkey;
alter table events add constraint events_visibility_min_role_fkey
  foreign key (visibility_min_role) references group_roles(id) on delete set null;

-- Old lists like {owner,admin} -> {role} + the LOWEST role in the list (Admin if it was ticked, else Owner)
update events e
   set join_min_role = (
         select r.id from group_roles r
          where r.group_id = e.group_id and r.rank = case when 'admin' = any(e.join_access) then 1 else 0 end
          limit 1),
       join_access = array['role']
 where e.group_id is not null and e.join_access && array['owner', 'admin'];

update events e
   set visibility_min_role = (
         select r.id from group_roles r
          where r.group_id = e.group_id and r.rank = case when 'admin' = any(e.visibility_access) then 1 else 0 end
          limit 1),
       visibility_access = array['role']
 where e.group_id is not null and e.visibility_access && array['owner', 'admin'];

alter table events add constraint events_join_access_check
  check (cardinality(join_access) = 1 and join_access <@ array['public', 'members', 'role']);
alter table events add constraint events_visibility_access_check
  check (cardinality(visibility_access) = 1 and visibility_access <@ array['public', 'members', 'role']);

-- 'ok' | 'non_member' | 'wrong_role' — does this audience setting let this person in?
create or replace function public.audience_status(p_group uuid, p_access text[], p_min_role uuid, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mr public.group_roles;
  need integer;
begin
  if p_group is null or 'public' = any(p_access) then return 'ok'; end if;
  mr := public.member_role(p_group, p_user);
  if mr.id is null then return 'non_member'; end if;
  if mr.is_owner or 'members' = any(p_access) then return 'ok'; end if;
  select rank into need from group_roles where id = p_min_role;
  if need is not null and mr.rank <= need then return 'ok'; end if;   -- that role AND everyone above it
  return 'wrong_role';
end;
$$;

create or replace function public.event_join_status(p_event uuid, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev events;
begin
  select * into ev from events where id = p_event;
  if not found then return 'missing'; end if;
  return public.audience_status(ev.group_id, ev.join_access, ev.join_min_role, p_user);
end;
$$;

-- Who can SEE an event
drop policy if exists "Events respect visibility" on events;
create policy "Events respect visibility"
  on events for select
  using (
    group_id is null
    or user_id = auth.uid()
    or public.audience_status(group_id, visibility_access, visibility_min_role, auth.uid()) = 'ok'
  );

-- New group event -> notify the members who are allowed to see it
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
      and public.audience_status(new.group_id, new.visibility_access, new.visibility_min_role, gm.user_id) = 'ok';
  exception when others then
    raise warning 'notify_group_event failed: %', sqlerrm;
  end;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Chat channels (max 4 per group)
--    Each of the four access levels names the LOWEST role that gets it —
--    everyone above that role gets it too:
--      view   = can see the channel exists
--      read   = can read its messages        (needs view)
--      send   = can write messages           (needs read)
--      manage = can edit/delete other people's messages (needs read)
-- ---------------------------------------------------------------------
create table if not exists group_channels (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  view_min_role uuid references group_roles(id) on delete set null,
  read_min_role uuid references group_roles(id) on delete set null,
  send_min_role uuid references group_roles(id) on delete set null,
  manage_messages_min_role uuid references group_roles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create unique index if not exists group_channels_name_idx on group_channels (group_id, lower(btrim(name)));
create index if not exists group_channels_group_idx on group_channels (group_id, created_at);

create table if not exists group_messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references group_channels(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists group_messages_channel_idx on group_messages (channel_id, created_at desc);

-- Limit, defaults and sanity checks for channels
create or replace function public.group_channel_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dflt uuid;
  owner_role uuid;
  rid uuid;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from group_channels where group_id = new.group_id) >= 4 then
      raise exception 'A group can have at most 4 channels';
    end if;
    select id into dflt from group_roles where group_id = new.group_id and is_default;
    select id into owner_role from group_roles where group_id = new.group_id and is_owner;
    new.view_min_role := coalesce(new.view_min_role, dflt);
    new.read_min_role := coalesce(new.read_min_role, dflt);
    new.send_min_role := coalesce(new.send_min_role, dflt);
    new.manage_messages_min_role := coalesce(new.manage_messages_min_role, owner_role);
  else
    new.group_id := old.group_id;
  end if;

  foreach rid in array array[new.view_min_role, new.read_min_role, new.send_min_role, new.manage_messages_min_role] loop
    if rid is not null and not exists (select 1 from group_roles where id = rid and group_id = new.group_id) then
      raise exception 'That role does not belong to this group';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists group_channel_rules_trigger on group_channels;
create trigger group_channel_rules_trigger
  before insert or update on group_channels
  for each row execute function public.group_channel_rules();

-- What can this person do in this channel? level = 'view' | 'read' | 'send' | 'manage'
create or replace function public.channel_access(p_channel uuid, p_level text, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch group_channels;
  mr public.group_roles;
begin
  select * into ch from group_channels where id = p_channel;
  if not found then return false; end if;
  mr := public.member_role(ch.group_id, p_user);
  if mr.id is null then return false; end if;
  if mr.is_owner then return true; end if;

  if mr.rank > coalesce(public.role_rank(ch.view_min_role), -1) then return false; end if;
  if p_level = 'view' then return true; end if;

  if mr.rank > coalesce(public.role_rank(ch.read_min_role), -1) then return false; end if;
  if p_level = 'read' then return true; end if;

  if p_level = 'send' then
    return mr.rank <= coalesce(public.role_rank(ch.send_min_role), -1);
  end if;
  if p_level = 'manage' then
    return mr.rank <= coalesce(public.role_rank(ch.manage_messages_min_role), -1);
  end if;
  return false;
end;
$$;

-- May I edit/delete THIS author's message? Needs 'manage' AND to outrank the author.
create or replace function public.can_moderate_message(p_channel uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.channel_access(p_channel, 'manage')
    and exists (
      select 1 from group_channels c
       where c.id = p_channel and public.outranks(c.group_id, auth.uid(), p_author)
    ), false);
$$;

create or replace function public.group_message_guard()
returns trigger
language plpgsql
as $$
begin
  new.channel_id := old.channel_id;
  new.sender_id := old.sender_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists group_message_guard_trigger on group_messages;
create trigger group_message_guard_trigger
  before update on group_messages
  for each row execute function public.group_message_guard();

alter table group_channels enable row level security;
alter table group_messages enable row level security;

drop policy if exists "Channels are visible to people who can view them" on group_channels;
create policy "Channels are visible to people who can view them"
  on group_channels for select using (
    public.channel_access(id, 'view')
    or public.has_group_perm(group_id, 'edit_channels')
    or public.has_group_perm(group_id, 'delete_channels')
    or (created_by = auth.uid() and public.has_group_perm(group_id, 'create_channels'))
  );
drop policy if exists "Channel creators can create channels" on group_channels;
create policy "Channel creators can create channels"
  on group_channels for insert to authenticated
  with check (created_by = auth.uid() and public.has_group_perm(group_id, 'create_channels'));
drop policy if exists "Channel editors can edit channels" on group_channels;
create policy "Channel editors can edit channels"
  on group_channels for update to authenticated
  using (public.has_group_perm(group_id, 'edit_channels'));
drop policy if exists "Channel deleters can delete channels" on group_channels;
create policy "Channel deleters can delete channels"
  on group_channels for delete to authenticated
  using (public.has_group_perm(group_id, 'delete_channels'));

drop policy if exists "Read messages you have access to" on group_messages;
create policy "Read messages you have access to"
  on group_messages for select to authenticated
  using (public.channel_access(channel_id, 'read'));
drop policy if exists "Send messages where you are allowed" on group_messages;
create policy "Send messages where you are allowed"
  on group_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.channel_access(channel_id, 'send'));
drop policy if exists "Edit your own messages or ones you moderate" on group_messages;
create policy "Edit your own messages or ones you moderate"
  on group_messages for update to authenticated
  using (
    (sender_id = auth.uid() and public.channel_access(channel_id, 'send'))
    or public.can_moderate_message(channel_id, sender_id)
  )
  with check (
    (sender_id = auth.uid() and public.channel_access(channel_id, 'send'))
    or public.can_moderate_message(channel_id, sender_id)
  );
drop policy if exists "Delete your own messages or ones you moderate" on group_messages;
create policy "Delete your own messages or ones you moderate"
  on group_messages for delete to authenticated
  using (
    (sender_id = auth.uid() and public.channel_access(channel_id, 'read'))
    or public.can_moderate_message(channel_id, sender_id)
  );

do $$
begin
  alter publication supabase_realtime add table group_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ---------------------------------------------------------------------
-- 8. Role editing functions (these enforce the hierarchy)
-- ---------------------------------------------------------------------

-- New roles slot in just above the base Member role. Max 10 roles per group.
create or replace function public.create_group_role(p_group uuid, p_name text, p_color text, p_permissions text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.group_roles;
  mem public.group_roles;
  perms text[];
  new_id uuid;
begin
  me := public.member_role(p_group);
  if me.id is null or not (me.is_owner or 'manage_roles' = any(me.permissions)) then
    raise exception 'You do not have permission to manage roles';
  end if;
  if (select count(*) from group_roles where group_id = p_group) >= 10 then
    raise exception 'A group can have at most 10 roles';
  end if;
  select * into mem from group_roles where group_id = p_group and is_default;
  if not me.is_owner and me.rank >= mem.rank then
    raise exception 'Your role cannot create roles';
  end if;
  perms := coalesce(p_permissions, '{}');
  if not (perms <@ public.all_group_permissions()) then raise exception 'Unknown permission'; end if;
  if not me.is_owner and not (perms <@ me.permissions) then
    raise exception 'You can only give permissions that you have yourself';
  end if;

  update group_roles set rank = rank + 1 where group_id = p_group and rank >= mem.rank;
  insert into group_roles (group_id, name, color, rank, permissions)
  values (p_group, btrim(p_name), coalesce(p_color, '#99aab5'), mem.rank, perms)
  returning id into new_id;
  return new_id;
end;
$$;

-- Edit a role's name, colour and permissions. You can only edit roles BELOW your own,
-- and only change permissions that you hold yourself. The Owner role's permissions never change.
create or replace function public.update_group_role(p_role uuid, p_name text, p_color text, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.group_roles;
  me public.group_roles;
  new_perms text[];
  changed text[];
begin
  select * into target from group_roles where id = p_role;
  if not found then raise exception 'Role not found'; end if;
  me := public.member_role(target.group_id);
  if me.id is null or not (me.is_owner or 'manage_roles' = any(me.permissions)) then
    raise exception 'You do not have permission to manage roles';
  end if;
  if not me.is_owner and me.rank >= target.rank then
    raise exception 'You can only edit roles below your own';
  end if;

  new_perms := case when target.is_owner then target.permissions else coalesce(p_permissions, '{}') end;
  if not (new_perms <@ public.all_group_permissions()) then raise exception 'Unknown permission'; end if;

  changed := array(select unnest(new_perms) except select unnest(target.permissions))
          || array(select unnest(target.permissions) except select unnest(new_perms));
  if not me.is_owner and not (changed <@ me.permissions) then
    raise exception 'You can only change permissions that you have yourself';
  end if;

  update group_roles
     set name = btrim(p_name),
         color = coalesce(p_color, color),
         permissions = new_perms
   where id = p_role;
end;
$$;

-- Delete a role. Its members drop to the base role; anything that pointed at it
-- (events, channels) moves UP to the next role above, so nothing becomes more open.
create or replace function public.delete_group_role(p_role uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.group_roles;
  me public.group_roles;
  dflt uuid;
  above uuid;
begin
  select * into target from group_roles where id = p_role;
  if not found then raise exception 'Role not found'; end if;
  if target.is_owner or target.is_default then raise exception 'This role cannot be deleted'; end if;
  me := public.member_role(target.group_id);
  if me.id is null or not (me.is_owner or 'manage_roles' = any(me.permissions)) then
    raise exception 'You do not have permission to manage roles';
  end if;
  if not me.is_owner and me.rank >= target.rank then
    raise exception 'You can only delete roles below your own';
  end if;

  select id into dflt from group_roles where group_id = target.group_id and is_default;
  select id into above from group_roles
   where group_id = target.group_id and rank < target.rank order by rank desc limit 1;

  update group_members set role_id = dflt where role_id = p_role;
  update events set join_min_role = above where join_min_role = p_role;
  update events set visibility_min_role = above where visibility_min_role = p_role;
  update group_channels set
    view_min_role = case when view_min_role = p_role then above else view_min_role end,
    read_min_role = case when read_min_role = p_role then above else read_min_role end,
    send_min_role = case when send_min_role = p_role then above else send_min_role end,
    manage_messages_min_role = case when manage_messages_min_role = p_role then above else manage_messages_min_role end
   where group_id = target.group_id;

  delete from group_roles where id = p_role;
  update group_roles set rank = rank - 1 where group_id = target.group_id and rank > target.rank;
end;
$$;

-- Re-order the hierarchy. p_order lists EVERY role id from top to bottom.
-- Owner must stay first and the base role last; you can only move roles below your own.
create or replace function public.reorder_group_roles(p_group uuid, p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.group_roles;
  r public.group_roles;
  n integer;
  i integer;
begin
  me := public.member_role(p_group);
  if me.id is null or not (me.is_owner or 'manage_roles' = any(me.permissions)) then
    raise exception 'You do not have permission to manage roles';
  end if;
  select count(*) into n from group_roles where group_id = p_group;
  if coalesce(array_length(p_order, 1), 0) <> n
     or (select count(distinct id) from group_roles where group_id = p_group and id = any(p_order)) <> n then
    raise exception 'Invalid role order';
  end if;

  for i in 1..n loop
    select * into r from group_roles where id = p_order[i];
    if r.is_owner and i <> 1 then raise exception 'The owner role must stay at the top'; end if;
    if r.is_default and i <> n then raise exception 'The base role must stay at the bottom'; end if;
    if not me.is_owner and r.rank <= me.rank and r.rank <> i - 1 then
      raise exception 'You can only move roles below your own';
    end if;
  end loop;

  update group_roles g
     set rank = o.ord - 1
    from unnest(p_order) with ordinality as o(id, ord)
   where g.id = o.id;
end;
$$;

-- Give a member a different role. Both their current role and the new one must be BELOW yours.
create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.group_roles;
  cur public.group_roles;
  nr public.group_roles;
begin
  me := public.member_role(p_group);
  if me.id is null or not (me.is_owner or 'manage_roles' = any(me.permissions)) then
    raise exception 'You do not have permission to manage roles';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  cur := public.member_role(p_group, p_user);
  if cur.id is null then raise exception 'That person is not in this group'; end if;
  select * into nr from group_roles where id = p_role and group_id = p_group;
  if nr.id is null then raise exception 'Role not found'; end if;
  if cur.is_owner or nr.is_owner then raise exception 'The owner role cannot be given or taken away'; end if;
  if not me.is_owner and (me.rank >= cur.rank or me.rank >= nr.rank) then
    raise exception 'You can only manage members and roles below your own';
  end if;
  update group_members set role_id = p_role where group_id = p_group and user_id = p_user;
end;
$$;

-- Kick a member. Needs the permission AND a strictly higher role than the target.
create or replace function public.kick_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.group_roles;
  tr public.group_roles;
begin
  me := public.member_role(p_group);
  if me.id is null or not (me.is_owner or 'kick_members' = any(me.permissions)) then
    raise exception 'You do not have permission to kick members';
  end if;
  if p_user = auth.uid() then raise exception 'Use "Leave group" to leave'; end if;
  tr := public.member_role(p_group, p_user);
  if tr.id is null then raise exception 'That person is not in this group'; end if;
  if tr.is_owner then raise exception 'The owner cannot be kicked'; end if;
  if not me.is_owner and me.rank >= tr.rank then
    raise exception 'You can only kick members with a lower role than yours';
  end if;
  delete from group_members where group_id = p_group and user_id = p_user;
end;
$$;

-- Approve a join request (adds them with the base role)
create or replace function public.approve_join_request(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_group_perm(p_group, 'manage_join_requests') then
    raise exception 'You do not have permission to approve join requests';
  end if;
  if not exists (select 1 from group_join_requests where group_id = p_group and user_id = p_user) then
    raise exception 'No such join request';
  end if;
  delete from group_join_requests where group_id = p_group and user_id = p_user;
  insert into group_members (group_id, user_id)
  values (p_group, p_user)
  on conflict (group_id, user_id) do nothing;
end;
$$;

grant execute on function public.create_group_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.update_group_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.delete_group_role(uuid) to authenticated;
grant execute on function public.reorder_group_roles(uuid, uuid[]) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, uuid) to authenticated;
grant execute on function public.kick_group_member(uuid, uuid) to authenticated;
grant execute on function public.approve_join_request(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 9. Row Level Security — rewritten to use permissions instead of 'owner'/'admin'
-- ---------------------------------------------------------------------

-- Groups
drop policy if exists "Admins can update group settings" on groups;
create policy "Admins can update group settings"
  on groups for update using (public.has_group_perm(id, 'manage_group'));

drop policy if exists "Only owners can delete groups" on groups;
create policy "Only owners can delete groups"
  on groups for delete using (coalesce((public.member_role(id)).is_owner, false));

-- Group members (role changes and kicks go through the functions above)
drop policy if exists "Group members viewable by all if setting allows" on group_members;
drop policy if exists "Group members are viewable" on group_members;
create policy "Group members are viewable"
  on group_members for select using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_members.group_id and g.members_visible)
    or public.has_group_perm(group_id, 'kick_members')
    or public.has_group_perm(group_id, 'manage_roles')
    or public.has_group_perm(group_id, 'manage_group')
  );

drop policy if exists "Users can join groups" on group_members;
drop policy if exists "Users can join open groups" on group_members;
create policy "Users can join open groups"
  on group_members for insert with check (
    auth.uid() = user_id
    and exists (select 1 from groups g where g.id = group_members.group_id and g.join_mode = 'open')
    and role_id = (select r.id from group_roles r where r.group_id = group_members.group_id and r.is_default)
  );

drop policy if exists "Owners can manage members" on group_members;          -- replaced by set_member_role()
drop policy if exists "Admins and owners can remove members" on group_members; -- replaced by kick_group_member()
drop policy if exists "Members can leave a group" on group_members;
create policy "Members can leave a group"
  on group_members for delete using (
    user_id = auth.uid()
    and not coalesce((public.member_role(group_id)).is_owner, false)
  );

-- Join requests
drop policy if exists "Join requests visible to admins and the requester" on group_join_requests;
create policy "Join requests visible to admins and the requester"
  on group_join_requests for select using (
    user_id = auth.uid() or public.has_group_perm(group_id, 'manage_join_requests')
  );
drop policy if exists "Admins and requesters can delete requests" on group_join_requests;
create policy "Admins and requesters can delete requests"
  on group_join_requests for delete using (
    user_id = auth.uid() or public.has_group_perm(group_id, 'manage_join_requests')
  );

-- Announcements
drop policy if exists "Admins can create announcements" on announcements;
create policy "Admins can create announcements"
  on announcements for insert with check (
    user_id = auth.uid() and public.has_group_perm(group_id, 'create_announcements')
  );
drop policy if exists "Admins can update announcements" on announcements;
create policy "Admins can update announcements"
  on announcements for update using (public.has_group_perm(group_id, 'edit_announcements'));
drop policy if exists "Admins can delete announcements" on announcements;
create policy "Admins can delete announcements"
  on announcements for delete using (public.has_group_perm(group_id, 'delete_announcements'));

-- Events
drop policy if exists "Authenticated users can create events" on events;
create policy "Authenticated users can create events"
  on events for insert with check (
    auth.uid() = user_id
    and (group_id is null or public.has_group_perm(group_id, 'create_events'))
  );

drop policy if exists "Event owners can update their events" on events;
drop policy if exists "Group admins can update group events" on events;
drop policy if exists "Event editors can update events" on events;
create policy "Event editors can update events"
  on events for update to authenticated
  using (
    (group_id is null and auth.uid() = user_id)
    or (group_id is not null and public.has_group_perm(group_id, 'edit_events'))
  )
  with check (
    (group_id is null and auth.uid() = user_id)
    or (group_id is not null and public.has_group_perm(group_id, 'edit_events'))
  );

drop policy if exists "Event owners can delete their events" on events;
drop policy if exists "Group admins can delete group events" on events;
drop policy if exists "Event deleters can delete events" on events;
create policy "Event deleters can delete events"
  on events for delete to authenticated
  using (
    (group_id is null and auth.uid() = user_id)
    or (group_id is not null and public.has_group_perm(group_id, 'delete_events'))
  );

-- Event labels
drop policy if exists "Event owners and group admins can add event labels" on event_label_assignments;
create policy "Event owners and group admins can add event labels"
  on event_label_assignments for insert to authenticated
  with check (
    exists (
      select 1 from events e
       where e.id = event_label_assignments.event_id
         and (e.user_id = auth.uid() or public.has_group_perm(e.group_id, 'edit_events'))
    )
  );
drop policy if exists "Event owners and group admins can remove event labels" on event_label_assignments;
create policy "Event owners and group admins can remove event labels"
  on event_label_assignments for delete to authenticated
  using (
    exists (
      select 1 from events e
       where e.id = event_label_assignments.event_id
         and (e.user_id = auth.uid() or public.has_group_perm(e.group_id, 'edit_events'))
    )
  );

-- Group image storage (folder name = group id)
drop policy if exists "Admins can upload group avatars" on storage.objects;
create policy "Admins can upload group avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(name))[1]
         and public.has_group_perm(g.id, 'manage_group')
    )
  );
drop policy if exists "Admins can replace group avatars" on storage.objects;
create policy "Admins can replace group avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(name))[1]
         and public.has_group_perm(g.id, 'manage_group')
    )
  );


-- ---------------------------------------------------------------------
-- 10. Retire the old text role column (nothing uses it any more)
--     If something you added yourself still depends on it, this is skipped
--     with a notice and the column is simply left alone.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_members' and column_name = 'role'
  ) then
    alter table group_members drop column role;
  end if;
exception when dependent_objects_still_exist then
  raise notice 'group_members.role is still used by another policy or view, so it was left in place. It is no longer used by Upp.';
end $$;

notify pgrst, 'reload schema';
