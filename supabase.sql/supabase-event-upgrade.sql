-- =============================================
-- Upp — Event thumbnails, cancelling events, label usage counts
-- Run this in the Supabase SQL Editor BEFORE deploying the new code.
-- (Run after supabase-roles-channels.sql and supabase-group-feed-update.sql.)
-- =============================================

-- 1. New event columns
alter table events add column if not exists image_url text;                                   -- thumbnail
alter table events add column if not exists cancelled_at timestamptz;                         -- null = not cancelled
alter table events add column if not exists cancelled_by uuid references profiles(id) on delete set null;

-- 2. Public storage bucket for event thumbnails.
--    Files live in a folder named after the group id: <group_id>/<random>.jpg
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "Event images are public" on storage.objects;
create policy "Event images are public"
  on storage.objects for select
  using (bucket_id = 'event-images');

drop policy if exists "Event posters can upload event images" on storage.objects;
create policy "Event posters can upload event images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' then
        public.has_group_perm(((storage.foldername(name))[1])::uuid, 'create_events')
        or public.has_group_perm(((storage.foldername(name))[1])::uuid, 'edit_events')
      else false
    end
  );

drop policy if exists "Event editors can replace event images" on storage.objects;
create policy "Event editors can replace event images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-images'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$' then
        public.has_group_perm(((storage.foldername(name))[1])::uuid, 'edit_events')
      else false
    end
  );

-- 3. A new notification type for cancelled events
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('group_event', 'group_announcement', 'connection_request',
                  'group_deleted', 'event_deleted', 'event_changed', 'message_request',
                  'event_cancelled'));

-- 4. Cancel an event (the event stays; everyone going or interested is notified).
--    Needs the same group permission as editing events ('edit_events').
create or replace function public.cancel_event(p_event uuid)
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
  if not found then raise exception 'Event not found'; end if;

  if not (
    (ev.group_id is null and ev.user_id = auth.uid())
    or (ev.group_id is not null and public.has_group_perm(ev.group_id, 'edit_events'))
  ) then
    raise exception 'You do not have permission to cancel this event';
  end if;

  if ev.cancelled_at is not null then
    raise exception 'This event has already been cancelled';
  end if;

  update events set cancelled_at = now(), cancelled_by = auth.uid() where id = p_event;

  if ev.group_id is not null then
    select name into gname from groups where id = ev.group_id;
  end if;

  -- going people get detail = 'attending'; people who were only interested get 'interested'
  insert into notifications (user_id, type, actor_id, group_id, event_id, group_name, title, detail)
  select u.user_id, 'event_cancelled', auth.uid(), ev.group_id, ev.id, gname, ev.title, u.kind
  from (
    select a.user_id, 'attending'::text as kind
      from attendees a where a.event_id = p_event
    union all
    select i.user_id, 'interested'::text
      from event_interests i
     where i.event_id = p_event
       and not exists (select 1 from attendees a2 where a2.event_id = p_event and a2.user_id = i.user_id)
  ) u
  where u.user_id is distinct from auth.uid();
end;
$$;

grant execute on function public.cancel_event(uuid) to authenticated;

-- 5. Nobody can say they're going / interested in a cancelled or finished event
create or replace function public.block_closed_event_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ev events;
begin
  select * into ev from events where id = new.event_id;
  if not found then return new; end if;
  if ev.cancelled_at is not null then
    raise exception 'This event has been cancelled';
  end if;
  if coalesce(ev.event_end, ev.event_date) < now() then
    raise exception 'This event has already happened';
  end if;
  return new;
end;
$$;

drop trigger if exists block_closed_event_attend on attendees;
create trigger block_closed_event_attend
  before insert on attendees
  for each row execute function public.block_closed_event_signup();

drop trigger if exists block_closed_event_interest on event_interests;
create trigger block_closed_event_interest
  before insert on event_interests
  for each row execute function public.block_closed_event_signup();

-- 6. Label usage counts (shown under each label suggestion).
--    Both run as the person asking, so label_event_counts only counts events
--    that person is allowed to see (public events + ones their group role can see).
create or replace function public.label_group_counts(p_label_ids uuid[])
returns table (label_id uuid, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select gla.label_id, count(distinct gla.group_id)
    from group_label_assignments gla
   where gla.label_id = any(p_label_ids)
   group by gla.label_id;
$$;

create or replace function public.label_event_counts(p_label_ids uuid[])
returns table (label_id uuid, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ela.label_id, count(distinct ela.event_id)
    from event_label_assignments ela
    join events e on e.id = ela.event_id
   where ela.label_id = any(p_label_ids)
   group by ela.label_id;
$$;

grant execute on function public.label_group_counts(uuid[]) to authenticated;
grant execute on function public.label_event_counts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
