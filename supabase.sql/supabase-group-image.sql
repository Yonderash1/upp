-- =============================================
-- Upp — Group images
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Column to store the group image URL
alter table groups add column if not exists image_url text;

-- 2. Public storage bucket for group images
insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

-- 3. Anyone can view group images
drop policy if exists "Group avatars are public" on storage.objects;
create policy "Group avatars are public"
  on storage.objects for select
  using (bucket_id = 'group-avatars');

-- 4. Only group admins/owners can upload or replace the image.
--    Files live in a folder named after the group id: <group_id>/avatar.jpg
drop policy if exists "Admins can upload group avatars" on storage.objects;
create policy "Admins can upload group avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );

drop policy if exists "Admins can replace group avatars" on storage.objects;
create policy "Admins can replace group avatars"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
        and gm.role in ('owner', 'admin')
    )
  );

-- Note: updating groups.image_url is already covered by the existing
-- "Admins can update group settings" policy on the groups table.
