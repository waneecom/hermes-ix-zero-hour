-- Sabotage progress is secret information. Keep it beside the target location,
-- outside the room state that authenticated room members can select directly.
alter table public.hermes_ix_room_internal
  add column destroyed smallint not null default 0
  check (destroyed between 0 and 5);

update public.hermes_ix_room_internal internal
set destroyed = least(5, greatest(0, coalesce((room.public_state->>'destroyed')::smallint, 0)))
from public.hermes_ix_rooms room
where room.id = internal.room_id;

update public.hermes_ix_rooms
set public_state = public_state - 'destroyed'
where public_state ? 'destroyed';

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

drop function public.hermes_ix_finalize_resolution(uuid, jsonb, text, uuid, jsonb);

create function public.hermes_ix_finalize_resolution(
  p_room_id uuid,
  p_public_state jsonb,
  p_status text,
  p_eliminated_user_id uuid,
  p_secret_updates jsonb,
  p_destroyed smallint
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_update jsonb;
begin
  if p_destroyed < 0 or p_destroyed > 5 then
    raise exception 'INVALID_SABOTAGE_PROGRESS';
  end if;

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

  update public.hermes_ix_room_internal
  set destroyed = p_destroyed
  where room_id = p_room_id;
  if not found then raise exception 'ROOM_INTERNAL_NOT_FOUND'; end if;

  update public.hermes_ix_rooms
  set status = p_status,
      public_state = p_public_state - 'destroyed',
      revision = revision + 1,
      updated_at = now()
  where id = p_room_id;
end;
$$;

revoke execute on function public.hermes_ix_finalize_resolution(uuid, jsonb, text, uuid, jsonb, smallint)
  from public, anon, authenticated;
grant execute on function public.hermes_ix_finalize_resolution(uuid, jsonb, text, uuid, jsonb, smallint)
  to service_role;
