-- ZivaBasa — migration: add missing `profiles` table + dependent policies/trigger/storage bucket
-- Safe to run against an already-deployed project; every statement is idempotent.

create table if not exists profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  organization    text,
  job_title       text,
  phone           text,
  department      text,
  avatar_url      text,
  requested_role  text not null default 'viewer' check (requested_role in ('viewer', 'admin')),
  role            text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at      timestamptz not null default now()
);

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists department text;
alter table profiles add column if not exists avatar_url text;

alter table profiles enable row level security;

drop policy if exists "own profile select" on profiles;
create policy "own profile select" on profiles
  for select using (user_id = auth.uid());

drop policy if exists "own profile insert" on profiles;
create policy "own profile insert" on profiles
  for insert with check (user_id = auth.uid() and role = 'viewer');

drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function lock_profile_role()
returns trigger as $$
begin
  if new.role <> old.role and current_user = 'authenticated' then
    raise exception 'role can only be changed by manual admin action, not by the user themselves';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_lock_role on profiles;
create trigger profiles_lock_role
  before update on profiles
  for each row execute function lock_profile_role();

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar owner write" on storage.objects;
create policy "avatar owner write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
