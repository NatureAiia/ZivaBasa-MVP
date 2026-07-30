-- ZivaBasa — migration: add review_queue (HITL pause/resume for low-confidence predictions)
-- Deliberately a separate table from `assignments` — that table's unique constraint and
-- redeployment-specific columns (role_id, from_role, to_role, cosine_similarity_score) don't
-- generalize to this use case. Safe to run against an already-deployed project; every
-- statement is idempotent.

create table if not exists review_queue (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task              text not null,
  source            text not null check (source in ('classification', 'forecast')),
  subject           text,
  predicted_value   jsonb not null,
  confidence_score  numeric,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'overridden', 'rejected')),
  note              text,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz
);

create index if not exists review_queue_user_id_idx on review_queue(user_id);
create index if not exists review_queue_status_idx on review_queue(user_id, status);

alter table review_queue enable row level security;

drop policy if exists "own rows only" on review_queue;
create policy "own rows only" on review_queue
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins can view all review items" on review_queue;
create policy "admins can view all review items" on review_queue
  for select using (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  );
