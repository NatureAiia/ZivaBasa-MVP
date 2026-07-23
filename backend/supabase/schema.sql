-- ZivaBasa — Supabase/Postgres schema (Phase: backend persistence + auth)
-- ---------------------------------------------------------------------
-- Run this once against a fresh Supabase project (SQL Editor, or `supabase db push`
-- if you're using the CLI with a migrations/ folder).
--
-- Design decision: this app uses Supabase's client-side SDK + Row Level Security
-- rather than routing CRUD through FastAPI. FastAPI stays exactly what it already is —
-- a stateless model-serving API (predict/explain/schema/batch/chat/reports). It owns no
-- user data and doesn't need to; Postgres + RLS is the auth-and-data layer, Supabase Auth
-- issues the JWT the anon key uses to enforce `user_id = auth.uid()` on every row. This
-- avoids hand-rolling a second REST CRUD layer in FastAPI that would just duplicate what
-- PostgREST already gives you for free, and keeps the two systems' responsibilities clean.
--
-- Every table below is a direct 1:1 port of an existing localStorage store (see
-- frontend/src/lib/*Store.js) — same field names in snake_case, same semantics. That
-- mapping is documented per-table below so the localStorage -> Postgres migration stays
-- traceable.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Shared trigger: keep updated_at current on every UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- org_nodes — was orgStore.js (My Organization / org chart)
-- ---------------------------------------------------------------------------
create table if not exists org_nodes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title             text not null,
  department        text,
  parent_id         uuid references org_nodes(id) on delete set null,
  current_skills    text[] not null default '{}',
  target_role       text,
  target_skills     text[] not null default '{}',
  seniority_years   numeric,
  headcount         integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists org_nodes_user_id_idx on org_nodes(user_id);
create index if not exists org_nodes_parent_id_idx on org_nodes(parent_id);

create trigger org_nodes_set_updated_at
  before update on org_nodes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- assignments — was assignmentStore.js (Roster approval workflow / audit trail)
-- ---------------------------------------------------------------------------
create table if not exists assignments (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role_id                  uuid references org_nodes(id) on delete cascade,
  role_title               text,
  from_role                text,
  to_role                  text,
  cosine_similarity_score  numeric,
  missing_skills           text[] not null default '{}',
  status                   text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note                     text,
  recommended_at           timestamptz not null default now(),
  decided_at               timestamptz
);

create index if not exists assignments_user_id_idx on assignments(user_id);
create index if not exists assignments_status_idx on assignments(user_id, status);
-- Mirrors orgStore's own dedup rule ("don't recommend the same role -> target twice").
create unique index if not exists assignments_role_target_uniq on assignments(user_id, role_id, to_role);

-- ---------------------------------------------------------------------------
-- batch_results — was batchStore.js (latest batch-upload KPI result, one per task)
-- ---------------------------------------------------------------------------
create table if not exists batch_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task       text not null,
  result     jsonb not null,
  saved_at   timestamptz not null default now(),
  unique (user_id, task)  -- "latest result per task" — upsert on this key
);

create index if not exists batch_results_user_id_idx on batch_results(user_id);

-- ---------------------------------------------------------------------------
-- sources — was sourcesStore.js (files fed into ZivaBasa: uploads + manual drops)
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  kind        text,             -- "pdf" | "image" | "text" | "csv"
  size        bigint,
  task        text,
  row_count   integer,
  added_at    timestamptz not null default now()
);

create index if not exists sources_user_id_idx on sources(user_id);

-- ---------------------------------------------------------------------------
-- usage_log — was usageStore.js (automatic chat LLM cost/usage log)
-- ---------------------------------------------------------------------------
create table if not exists usage_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider       text not null,
  model          text,
  input_tokens   integer default 0,
  output_tokens  integer default 0,
  cost_usd       numeric default 0,
  created_at     timestamptz not null default now()
);

create index if not exists usage_log_user_id_created_idx on usage_log(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- cost_entries — was costStore.js (manual cost-monitoring line items)
-- ---------------------------------------------------------------------------
create table if not exists cost_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_key     text not null,
  monthly_usd  numeric,
  note         text,
  updated_at   timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists cost_entries_user_id_idx on cost_entries(user_id);

-- ---------------------------------------------------------------------------
-- chat_sessions — was chatSessionStore.js (one live session per user)
-- ---------------------------------------------------------------------------
create table if not exists chat_sessions (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  messages       jsonb not null default '[]',
  tool_call_log  jsonb not null default '[]',
  updated_at     timestamptz not null default now()
);

create trigger chat_sessions_set_updated_at
  before update on chat_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- predict_history — was history.js (run history, capped at 50 client-side today;
-- kept uncapped here since Postgres storage is cheap — trim in a scheduled job later
-- if it matters)
-- ---------------------------------------------------------------------------
create table if not exists predict_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  results     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists predict_history_user_id_created_idx on predict_history(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- profiles — signup-time info needed to assess a user's rights (name, org, job title,
-- requested role). `role` is what the app actually gates on; it defaults to 'viewer' and
-- only ever changes via manual admin action (Supabase dashboard / a direct SQL update by an
-- existing admin) — there is deliberately no invite-code or other self-service path to
-- 'admin' here, since any such check running in frontend code can't hide a real secret.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  organization    text,
  job_title       text,
  phone           text,
  department      text,
  avatar_url      text,
  requested_role  text not null default 'viewer' check (requested_role in ('viewer', 'admin', 'superadmin')),
  role            text not null default 'viewer' check (role in ('viewer', 'admin', 'superadmin')),
  created_at      timestamptz not null default now()
);

-- Settings-page addition (phone/department/avatar_url) — idempotent so this file can be
-- re-run against an already-deployed project without erroring on columns that already exist
-- from a fresh install's `create table` above.
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists department text;
alter table profiles add column if not exists avatar_url text;

-- 3rd role tier (superadmin), added for the Systems/Users page — idempotent widen for an
-- already-deployed project whose check constraints predate 'superadmin'. Postgres has no
-- "alter constraint" that adds an enum value in place, so this drops and recreates both by
-- their known original names; if you've since renamed them, adjust the names below.
alter table profiles drop constraint if exists profiles_requested_role_check;
alter table profiles add constraint profiles_requested_role_check
  check (requested_role in ('viewer', 'admin', 'superadmin'));
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('viewer', 'admin', 'superadmin'));

-- ---------------------------------------------------------------------------
-- Row Level Security — every table, every row scoped to its owner. This is the actual
-- security boundary (the anon key is public by design in Supabase's model); without RLS
-- enabled, any authenticated user could read/write any other user's rows.
-- ---------------------------------------------------------------------------
alter table org_nodes        enable row level security;
alter table assignments      enable row level security;
alter table batch_results    enable row level security;
alter table sources          enable row level security;
alter table usage_log        enable row level security;
alter table cost_entries     enable row level security;
alter table chat_sessions    enable row level security;
alter table predict_history  enable row level security;
alter table profiles         enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'org_nodes', 'assignments', 'batch_results', 'sources',
    'usage_log', 'cost_entries', 'chat_sessions', 'predict_history'
  ]
  loop
    execute format('drop policy if exists "own rows only" on %I;', t);
    execute format(
      'create policy "own rows only" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t
    );
  end loop;
end $$;

-- profiles gets its own, narrower policies instead of the generic "own rows only" loop above:
-- a plain owner-scoped policy would let a signed-in user UPDATE their *own* `role` column
-- straight to 'admin' through the normal client SDK, which defeats the whole point of manual
-- admin approval. Select/insert are owner-scoped as usual; insert additionally pins role to
-- 'viewer' regardless of what a hand-crafted request claims; update is locked to prevent
-- role changes at the RLS layer, reinforced by a trigger below (belt and suspenders — the
-- trigger also protects against any future policy edit that loosens this).
create policy "own profile select" on profiles
  for select using (user_id = auth.uid());

-- Added for the Systems -> Users page: an admin/superadmin needs to see every profile, not just
-- their own, to approve pending signups and manage roles. A self-referential subquery on the
-- caller's OWN row (not the row being read) — this does not let anyone escalate what they can
-- SEE based on the target row's contents, only based on who the caller already is.
create policy "admins can view all profiles" on profiles
  for select using (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  );

create policy "own profile insert" on profiles
  for insert with check (user_id = auth.uid() and role = 'viewer');

create policy "own profile update" on profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Belt-and-suspenders: reject any attempt to change `role` that comes through PostgREST as the
-- 'authenticated' Postgres role (i.e. a normal logged-in user via the anon/authenticated key).
-- Manual admin promotion is expected to run as the 'postgres' role (Supabase SQL editor /
-- dashboard), which this check does not touch.
create or replace function lock_profile_role()
returns trigger as $$
begin
  if new.role <> old.role and current_user = 'authenticated' then
    raise exception 'role can only be changed by manual admin action, not by the user themselves';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger profiles_lock_role
  before update on profiles
  for each row execute function lock_profile_role();

-- promote_user_role — the in-app replacement for "manual admin promotion via the Supabase SQL
-- editor" the comment above used to require. SECURITY DEFINER so it can update a row that
-- isn't the caller's own (the update-policy above only allows a user to update their own row,
-- and the trigger above blocks even that from touching `role`) — but the function itself
-- re-checks the caller's own role as its first statement, so it's not a blanket bypass: only a
-- signed-in 'superadmin' can successfully call this, checked server-side, not just hidden in
-- frontend code. Used by the new Systems -> Users page.
create or replace function promote_user_role(target_user_id uuid, new_role text)
returns void as $$
declare
  caller_role text;
begin
  if new_role not in ('viewer', 'admin', 'superadmin') then
    raise exception 'invalid role: %', new_role;
  end if;

  select role into caller_role from profiles where user_id = auth.uid();
  if caller_role is distinct from 'superadmin' then
    raise exception 'only a superadmin can change another user''s role';
  end if;

  update profiles set role = new_role where user_id = target_user_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- avatars storage bucket — profile photo uploads (Settings page, added alongside the
-- phone/department/avatar_url profile columns above). Public-read (so <img src={avatar_url}>
-- works directly, no signed URL needed), but writes are scoped to the uploader's own folder
-- (avatars/{user_id}/...) via the storage.objects policies below — the same owner-scoping
-- principle as every other table in this file, applied to Storage instead of Postgres rows.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatar owner write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatar owner delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
