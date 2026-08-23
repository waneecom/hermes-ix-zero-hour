-- Make the browser-deny intent explicit for server-only game secrets.
-- The service_role used by the Edge Function bypasses RLS.
create policy "deny browser access to player secrets"
on public.hermes_ix_player_secrets
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny browser access to room internals"
on public.hermes_ix_room_internal
for all
to anon, authenticated
using (false)
with check (false);

create policy "deny browser access to round actions"
on public.hermes_ix_round_actions
for all
to anon, authenticated
using (false)
with check (false);

-- Cover foreign keys used during auth-user cleanup and room lifecycle checks.
create index hermes_ix_rooms_host_user_idx
on public.hermes_ix_rooms (host_user_id);

create index hermes_ix_round_actions_user_idx
on public.hermes_ix_round_actions (user_id);
