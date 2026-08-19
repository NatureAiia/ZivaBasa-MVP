-- ZivaBasa — migration: engagement/growth mechanics tables (onboarding, token economy,
-- milestones, feature discovery, department engagement, org/invite scaffolding).
-- Safe to run against an already-deployed project; every statement is idempotent.
--
-- Design note on token_balances/token_ledger: unlike every other table in this project, these
-- are NOT "own rows only" read+write for the client. A user can SELECT their own balance/ledger
-- (so the UI can render it), but INSERT/UPDATE happens only via the backend's service-role key
-- (see backend/api/tokens.py) — the same reasoning as why usage_log's frontend-direct-insert
-- pattern isn't trustworthy for anything that has to actually gate access: a client that can
-- write its own balance can just top itself up. RLS enforces "read-only to the owner" here;
-- the spend_tokens() function below is the only sanctioned write path, and it's SECURITY DEFINER
-- so it can be called through PostgREST's RPC endpoint with the service-role key from the backend.

-- ---------------------------------------------------------------------------
-- token_balances — one row per user, the real deductible balance (mechanic 3)
-- ---------------------------------------------------------------------------
create table if not exists token_balances (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  balance          integer not null default 0,
  monthly_grant    integer not null default 0,
  cycle_started_at timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists token_balances_set_updated_at on token_balances;
create trigger token_balances_set_updated_at
  before update on token_balances
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- token_ledger — append-only audit trail of every grant/deduction (mechanic 3)
-- ---------------------------------------------------------------------------
create table if not exists token_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  delta         integer not null,        -- negative = spend, positive = grant/refund
  reason        text not null,           -- 'predict' | 'predict_batch' | 'skill_match' |
                                          -- 'chat_agent' | 'report' | 'monthly_grant' |
                                          -- 'referral_bonus' | 'admin_adjustment'
  endpoint      text,
  balance_after integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists token_ledger_user_id_created_idx on token_ledger(user_id, created_at desc);

-- spend_tokens — the single sanctioned write path for token_balances/token_ledger. Atomic
-- check-and-deduct (or grant, for positive p_amount) so two concurrent requests can't both pass
-- a pre-check and overdraw the balance. SECURITY DEFINER so the backend can call it via the
-- service-role key regardless of RLS; callers passing a negative p_amount that would take the
-- balance below zero get NULL back (insufficient balance), not an exception, so backend code can
-- branch on the result without a try/except around a DB error.
create or replace function spend_tokens(
  p_user_id  uuid,
  p_amount   integer,   -- negative to spend, positive to grant
  p_reason   text,
  p_endpoint text default null
) returns integer as $$
declare
  new_balance integer;
begin
  insert into token_balances (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update token_balances
  set balance = balance + p_amount
  where user_id = p_user_id and balance + p_amount >= 0
  returning balance into new_balance;

  if new_balance is null then
    return null; -- insufficient balance, nothing was deducted
  end if;

  insert into token_ledger (user_id, delta, reason, endpoint, balance_after)
  values (p_user_id, p_amount, p_reason, p_endpoint, new_balance);

  return new_balance;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- onboarding_progress — mechanic 1, one row per user, client-writable (no server trust needed
-- for "did I click through my own onboarding checklist")
-- ---------------------------------------------------------------------------
create table if not exists onboarding_progress (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  connected_data_source  boolean not null default false,
  ran_first_prediction   boolean not null default false,
  opened_first_shap      boolean not null default false,
  invited_teammate       boolean not null default false,
  exported_first_report  boolean not null default false,
  completed_at           timestamptz,
  updated_at             timestamptz not null default now()
);

drop trigger if exists onboarding_progress_set_updated_at on onboarding_progress;
create trigger onboarding_progress_set_updated_at
  before update on onboarding_progress
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- feature_discovery — mechanic 5, tracks which entitled-but-unused features to nudge
-- ---------------------------------------------------------------------------
create table if not exists feature_discovery (
  user_id       uuid not null references auth.users(id) on delete cascade,
  feature_key   text not null,   -- 'chat_reports' | 'org_chart_upload' | 'skill_match' | ...
  first_used_at timestamptz,
  dismissed_at  timestamptz,
  primary key (user_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- milestone_events — mechanic 4, records which milestones have already fired for a user, so
-- toasts show once, not on every repeat visit
-- ---------------------------------------------------------------------------
create table if not exists milestone_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  milestone_key  text not null,  -- 'first_skill_match' | 'first_report_export' |
                                  -- 'first_month_assignment_decided'
  fired_at       timestamptz not null default now(),
  unique (user_id, milestone_key)
);

-- ---------------------------------------------------------------------------
-- department_report_views — mechanic 6, "whether a department's skills-gap report was viewed
-- this quarter" — operational engagement only, never individual risk scores
-- ---------------------------------------------------------------------------
create table if not exists department_report_views (
  user_id    uuid not null references auth.users(id) on delete cascade,
  department text not null,
  viewed_at  timestamptz not null default now()
);

create index if not exists department_report_views_user_dept_idx
  on department_report_views(user_id, department, viewed_at desc);

-- ---------------------------------------------------------------------------
-- organizations / invites — schema for mechanic 7 (referral/expansion), shipped this pass per
-- explicit product decision. NOTE: org_nodes/assignments are NOT re-scoped to organization_id
-- here — that would require rewriting every RLS policy on those tables from user-scoped to
-- org-scoped, which is a materially larger, separately-reviewed change. Until that lands, an
-- accepted invite links a teammate's profile to the same organizations row, but their
-- org_nodes/assignments remain their own separate, RLS-isolated rows — invite UI copy must say
-- so plainly rather than implying real shared-workspace collaboration today.
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invited_by      uuid not null references auth.users(id),
  email           text not null,
  role            text not null default 'admin' check (role in ('viewer', 'admin')),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  token           uuid not null default gen_random_uuid(),
  bonus_tokens    integer default 0,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz
);

create unique index if not exists invites_org_email_pending_idx
  on invites(organization_id, email) where status = 'pending';
create index if not exists invites_token_idx on invites(token);

alter table profiles add column if not exists organization_id uuid references organizations(id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table token_balances           enable row level security;
alter table token_ledger             enable row level security;
alter table onboarding_progress      enable row level security;
alter table feature_discovery        enable row level security;
alter table milestone_events         enable row level security;
alter table department_report_views  enable row level security;
alter table organizations            enable row level security;
alter table invites                  enable row level security;

drop policy if exists "own balance read" on token_balances;
create policy "own balance read" on token_balances
  for select using (user_id = auth.uid());

drop policy if exists "own ledger read" on token_ledger;
create policy "own ledger read" on token_ledger
  for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'onboarding_progress', 'feature_discovery', 'milestone_events', 'department_report_views'
  ]
  loop
    execute format('drop policy if exists "own rows only" on %I;', t);
    execute format(
      'create policy "own rows only" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t
    );
  end loop;
end $$;

-- organizations: readable by the owner and by anyone whose profile is already linked to it;
-- only the owner can create/update their own org row.
drop policy if exists "org owner or member read" on organizations;
create policy "org owner or member read" on organizations
  for select using (
    owner_user_id = auth.uid()
    or exists (select 1 from profiles p where p.user_id = auth.uid() and p.organization_id = organizations.id)
  );

drop policy if exists "org owner write" on organizations;
create policy "org owner write" on organizations
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "org owner update" on organizations;
create policy "org owner update" on organizations
  for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- invites: visible to whoever sent them (to manage) and creatable by an org owner/member —
-- deliberately NOT visible to the invitee by default (they don't have an account yet; the
-- accept flow uses the invite's `token`, not a row-level read, the same "secret in the URL"
-- pattern as a password-reset link).
drop policy if exists "invites visible to inviter" on invites;
create policy "invites visible to inviter" on invites
  for select using (invited_by = auth.uid());

drop policy if exists "invites created by org member" on invites;
create policy "invites created by org member" on invites
  for insert with check (
    invited_by = auth.uid()
    and exists (
      select 1 from organizations o
      where o.id = invites.organization_id and o.owner_user_id = auth.uid()
    )
  );
