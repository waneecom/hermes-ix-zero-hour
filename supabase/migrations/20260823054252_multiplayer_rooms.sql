create table public.hermes_ix_rooms (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'action', 'resolving', 'resolution', 'investigation', 'broadcast', 'arrest', 'gameover')),
  current_round smallint not null default 1 check (current_round >= 1),
  revision bigint not null default 0,
  public_state jsonb not null default '{"players":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table public.hermes_ix_room_members (
  room_id uuid not null references public.hermes_ix_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  name text not null check (char_length(name) between 1 and 16),
  eliminated boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create index hermes_ix_room_members_user_room_idx
  on public.hermes_ix_room_members (user_id, room_id);

create table public.hermes_ix_player_secrets (
  room_id uuid not null references public.hermes_ix_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null check (role_id in ('pilot', 'scientist', 'security', 'spy')),
  hand jsonb not null,
  totals jsonb not null,
  private_log text,
  private_result jsonb,
  primary key (room_id, user_id)
);

create index hermes_ix_player_secrets_user_room_idx
  on public.hermes_ix_player_secrets (user_id, room_id);

create table public.hermes_ix_room_internal (
  room_id uuid primary key references public.hermes_ix_rooms(id) on delete cascade,
  target_location_id smallint not null check (target_location_id between 1 and 13)
);

create table public.hermes_ix_round_actions (
  room_id uuid not null references public.hermes_ix_rooms(id) on delete cascade,
  round smallint not null check (round >= 1),
  user_id uuid not null references auth.users(id) on delete cascade,
  action jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, user_id)
);

create index hermes_ix_round_actions_room_round_idx
  on public.hermes_ix_round_actions (room_id, round);

alter table public.hermes_ix_rooms enable row level security;
alter table public.hermes_ix_rooms force row level security;
alter table public.hermes_ix_room_members enable row level security;
alter table public.hermes_ix_room_members force row level security;
alter table public.hermes_ix_player_secrets enable row level security;
alter table public.hermes_ix_player_secrets force row level security;
alter table public.hermes_ix_room_internal enable row level security;
alter table public.hermes_ix_room_internal force row level security;
alter table public.hermes_ix_round_actions enable row level security;
alter table public.hermes_ix_round_actions force row level security;

revoke all on table public.hermes_ix_rooms from anon, authenticated;
revoke all on table public.hermes_ix_room_members from anon, authenticated;
revoke all on table public.hermes_ix_player_secrets from anon, authenticated;
revoke all on table public.hermes_ix_room_internal from anon, authenticated;
revoke all on table public.hermes_ix_round_actions from anon, authenticated;

grant select on table public.hermes_ix_rooms to authenticated;
grant select on table public.hermes_ix_room_members to authenticated;

create policy "room members can read synchronized room state"
  on public.hermes_ix_rooms for select to authenticated
  using (
    exists (
      select 1
      from public.hermes_ix_room_members member
      where member.room_id = id
        and member.user_id = (select auth.uid())
    )
  );

create policy "room members can read their own membership"
  on public.hermes_ix_room_members for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.hermes_ix_create_room(
  p_room_id uuid,
  p_code text,
  p_user_id uuid,
  p_name text
) returns uuid
language plpgsql
set search_path = ''
as $$
begin
  insert into public.hermes_ix_rooms (id, code, host_user_id, public_state)
  values (
    p_room_id,
    upper(p_code),
    p_user_id,
    jsonb_build_object(
      'players', jsonb_build_array(jsonb_build_object(
        'seat', 0, 'name', p_name, 'eliminated', false, 'submitted', false
      )),
      'destroyed', 0,
      'lastIsolation', null,
      'spyExposed', false,
      'report', null,
      'result', null
    )
  );

  insert into public.hermes_ix_room_members (room_id, user_id, seat, name)
  values (p_room_id, p_user_id, 0, p_name);

  return p_room_id;
end;
$$;

create or replace function public.hermes_ix_join_room(
  p_code text,
  p_user_id uuid,
  p_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.hermes_ix_rooms%rowtype;
  v_seat smallint;
  v_players jsonb;
begin
  select * into v_room
  from public.hermes_ix_rooms
  where code = upper(p_code) and expires_at > now()
  for update;

  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception 'ROOM_ALREADY_STARTED'; end if;

  select seat into v_seat
  from public.hermes_ix_room_members
  where room_id = v_room.id and user_id = p_user_id;

  if found then
    return jsonb_build_object('room_id', v_room.id, 'seat', v_seat);
  end if;

  select candidate::smallint into v_seat
  from generate_series(0, 3) candidate
  where not exists (
    select 1 from public.hermes_ix_room_members member
    where member.room_id = v_room.id and member.seat = candidate
  )
  order by candidate
  limit 1;

  if v_seat is null then raise exception 'ROOM_FULL'; end if;

  insert into public.hermes_ix_room_members (room_id, user_id, seat, name)
  values (v_room.id, p_user_id, v_seat, p_name);

  select jsonb_agg(
    jsonb_build_object(
      'seat', member.seat,
      'name', member.name,
      'eliminated', member.eliminated,
      'submitted', false
    ) order by member.seat
  ) into v_players
  from public.hermes_ix_room_members member
  where member.room_id = v_room.id;

  update public.hermes_ix_rooms
  set public_state = jsonb_set(public_state, '{players}', v_players),
      revision = revision + 1,
      updated_at = now()
  where id = v_room.id;

  return jsonb_build_object('room_id', v_room.id, 'seat', v_seat);
end;
$$;

create or replace function public.hermes_ix_start_room(
  p_room_id uuid,
  p_host_user_id uuid,
  p_assignments jsonb,
  p_target_location_id smallint,
  p_public_state jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_room public.hermes_ix_rooms%rowtype;
begin
  select * into v_room from public.hermes_ix_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_user_id <> p_host_user_id then raise exception 'HOST_ONLY'; end if;
  if v_room.status <> 'lobby' then raise exception 'ROOM_ALREADY_STARTED'; end if;
  if (select count(*) from public.hermes_ix_room_members where room_id = p_room_id) <> 4 then
    raise exception 'FOUR_PLAYERS_REQUIRED';
  end if;
  if jsonb_array_length(p_assignments) <> 4 then raise exception 'INVALID_ASSIGNMENTS'; end if;

  insert into public.hermes_ix_player_secrets (room_id, user_id, role_id, hand, totals, private_log)
  select
    p_room_id,
    (entry->>'user_id')::uuid,
    entry->>'role_id',
    entry->'hand',
    entry->'totals',
    '아직 실행된 비밀 행동이 없습니다.'
  from jsonb_array_elements(p_assignments) entry;

  insert into public.hermes_ix_room_internal (room_id, target_location_id)
  values (p_room_id, p_target_location_id);

  update public.hermes_ix_rooms
  set status = 'action', current_round = 1, public_state = p_public_state,
      revision = revision + 1, updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.hermes_ix_store_action(
  p_room_id uuid,
  p_round smallint,
  p_user_id uuid,
  p_action jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.hermes_ix_rooms%rowtype;
  v_seat smallint;
  v_eliminated boolean;
  v_active_count integer;
  v_action_count integer;
  v_should_resolve boolean;
  v_state jsonb;
begin
  select * into v_room from public.hermes_ix_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'action' or v_room.current_round <> p_round then raise exception 'ACTION_PHASE_CLOSED'; end if;

  select seat, eliminated into v_seat, v_eliminated
  from public.hermes_ix_room_members
  where room_id = p_room_id and user_id = p_user_id;
  if not found then raise exception 'NOT_A_ROOM_MEMBER'; end if;
  if v_eliminated then raise exception 'PLAYER_ELIMINATED'; end if;

  insert into public.hermes_ix_round_actions (room_id, round, user_id, action)
  values (p_room_id, p_round, p_user_id, p_action);

  v_state := jsonb_set(v_room.public_state, array['players', v_seat::text, 'submitted'], 'true'::jsonb);

  select count(*) into v_active_count
  from public.hermes_ix_room_members
  where room_id = p_room_id and not eliminated;

  select count(*) into v_action_count
  from public.hermes_ix_round_actions
  where room_id = p_room_id and round = p_round;

  v_should_resolve := v_action_count = v_active_count;

  update public.hermes_ix_rooms
  set status = case when v_should_resolve then 'resolving' else status end,
      public_state = v_state,
      revision = revision + 1,
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object('should_resolve', v_should_resolve);
end;
$$;

create or replace function public.hermes_ix_finalize_resolution(
  p_room_id uuid,
  p_public_state jsonb,
  p_status text,
  p_eliminated_user_id uuid,
  p_secret_updates jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_update jsonb;
begin
  perform 1 from public.hermes_ix_rooms where id = p_room_id and status = 'resolving' for update;
  if not found then raise exception 'ROOM_NOT_RESOLVING'; end if;

  if p_eliminated_user_id is not null then
    update public.hermes_ix_room_members
    set eliminated = true
    where room_id = p_room_id and user_id = p_eliminated_user_id;
  end if;

  for v_update in select value from jsonb_array_elements(coalesce(p_secret_updates, '[]'::jsonb))
  loop
    update public.hermes_ix_player_secrets
    set private_log = coalesce(v_update->>'private_log', private_log),
        private_result = case when v_update ? 'private_result' then v_update->'private_result' else private_result end
    where room_id = p_room_id and user_id = (v_update->>'user_id')::uuid;
  end loop;

  update public.hermes_ix_rooms
  set status = p_status,
      public_state = p_public_state,
      revision = revision + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

revoke execute on function public.hermes_ix_create_room(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.hermes_ix_join_room(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.hermes_ix_start_room(uuid, uuid, jsonb, smallint, jsonb) from public, anon, authenticated;
revoke execute on function public.hermes_ix_store_action(uuid, smallint, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.hermes_ix_finalize_resolution(uuid, jsonb, text, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.hermes_ix_create_room(uuid, text, uuid, text) to service_role;
grant execute on function public.hermes_ix_join_room(text, uuid, text) to service_role;
grant execute on function public.hermes_ix_start_room(uuid, uuid, jsonb, smallint, jsonb) to service_role;
grant execute on function public.hermes_ix_store_action(uuid, smallint, uuid, jsonb) to service_role;
grant execute on function public.hermes_ix_finalize_resolution(uuid, jsonb, text, uuid, jsonb) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'hermes_ix_rooms'
  ) then
    alter publication supabase_realtime add table public.hermes_ix_rooms;
  end if;
end $$;
