-- ZivaBasa — migration: add prediction_feedback (quality-flagging loop for predict_history runs)
-- Safe to run against an already-deployed project; every statement is idempotent.

create table if not exists prediction_feedback (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  predict_history_id   uuid references predict_history(id) on delete cascade,
  task                 text not null,
  rating               text not null check (rating in ('up', 'down')),
  category             text check (category in ('data-quality', 'model-drift', 'explanation-unclear', 'outcome-mismatch', 'other')),
  note                 text,
  created_at           timestamptz not null default now(),
  unique (user_id, predict_history_id)
);

create index if not exists prediction_feedback_user_id_idx on prediction_feedback(user_id);
create index if not exists prediction_feedback_task_idx on prediction_feedback(task, rating);

alter table prediction_feedback enable row level security;

drop policy if exists "own rows only" on prediction_feedback;
create policy "own rows only" on prediction_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins can view all feedback" on prediction_feedback;
create policy "admins can view all feedback" on prediction_feedback
  for select using (
    exists (
      select 1 from profiles p
      where p.user_id = auth.uid() and p.role in ('admin', 'superadmin')
    )
  );
