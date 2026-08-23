create table public.hermes_ix_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'HERMES-IX MISSION',
  status text not null default 'active'
    check (status in ('active', 'crew_won', 'spy_won', 'abandoned')),
  current_round smallint not null default 1 check (current_round >= 1),
  rules_version text not null default '2.0',
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hermes_ix_games_owner_updated_idx
  on public.hermes_ix_games (owner_id, updated_at desc);

alter table public.hermes_ix_games enable row level security;
alter table public.hermes_ix_games force row level security;

revoke all on table public.hermes_ix_games from anon;
grant select, insert, update, delete on table public.hermes_ix_games to authenticated;

create policy "owners can read hermes games"
  on public.hermes_ix_games for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners can create hermes games"
  on public.hermes_ix_games for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "owners can update hermes games"
  on public.hermes_ix_games for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners can delete hermes games"
  on public.hermes_ix_games for delete to authenticated
  using ((select auth.uid()) = owner_id);
