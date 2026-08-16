-- ZivaBasa — migration: add entity_links (confirmed cross-dataset golden-record links)
-- Safe to run against an already-deployed project; every statement is idempotent.

create table if not exists entity_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  golden_id    uuid not null default gen_random_uuid(),
  task         text not null,
  row_label    text not null,
  match_score  numeric,
  created_at   timestamptz not null default now(),
  unique (user_id, task, row_label)
);

create index if not exists entity_links_user_id_idx on entity_links(user_id);
create index if not exists entity_links_golden_id_idx on entity_links(golden_id);

alter table entity_links enable row level security;

drop policy if exists "own rows only" on entity_links;
create policy "own rows only" on entity_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
