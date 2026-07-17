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

do $$
declare
  t text;
begin
  foreach t in array array[
    'org_nodes', 'assignments', 'batch_results', 'sources',
    'usage_log', 'cost_entries', 'chat_sessions', 'predict_history'
  ]
  loop
    execute format(
      'create policy "own rows only" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t
    );
  end loop;
end $$;
