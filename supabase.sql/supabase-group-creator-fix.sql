-- =============================================
-- Fix: Auto-add creator as member on group creation
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add 'creator' as a valid role
alter table group_members drop constraint if exists group_members_role_check;
alter table group_members add constraint group_members_role_check
  check (role in ('creator', 'owner', 'admin', 'member'));

-- 2. Create a trigger function that runs as superuser (bypasses RLS)
create or replace function public.handle_new_group()
returns trigger as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'creator');
  return new;
end;
$$ language plpgsql security definer;

-- 3. Attach the trigger to the groups table
drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute procedure public.handle_new_group();

-- 4. Fix existing groups where creator isn't a member
-- (backfills any groups already created)
insert into public.group_members (group_id, user_id, role)
select id, created_by, 'creator'
from public.groups
where created_by is not null
on conflict (group_id, user_id) do update set role = 'creator';
