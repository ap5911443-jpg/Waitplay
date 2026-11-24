-- pgTAP tests for the account schema: run with `supabase test db` (Docker). Two users, A and B, must never see or change each
-- other's data, `anon` must see nothing, and clients must not be able to edit their plan or status.
begin;
set local search_path to public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- runs a statement and returns how many rows it changed (data-modifying CTEs cannot be nested inside a SELECT)
create function pg_temp.affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- two users (the auth trigger creates their profile + entitlement)
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', 'authenticated', 'authenticated');

select is((select count(*) from public.profiles where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')), 2::bigint, 'profiles are created by the trigger');
select is((select plan from public.entitlements where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'free', 'new users are on the free plan');

-- ── user A ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select count(*) from public.profiles), 1::bigint, 'A sees exactly one profile');
select is((select count(*) from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'A cannot read B''s profile');
select is((select count(*) from public.entitlements), 1::bigint, 'A sees only their own entitlement');

select is(pg_temp.affected($$update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$), 0::bigint, 'A cannot update B''s profile');
select lives_ok($$update public.profiles set display_name = 'Ada' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, 'A can rename themselves');
select throws_ok($$update public.profiles set status = 'suspended' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'A cannot change their own account status');
select throws_ok($$update public.entitlements set plan = 'pro' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'A cannot upgrade themselves');
select throws_ok($$insert into public.entitlements (user_id, plan) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pro')$$, '42501', null, 'A cannot insert an entitlement');
select throws_ok($$insert into public.devices (user_id, device_id, platform) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'direct-insert-0000000', 'windows')$$, '42501', null, 'devices cannot be written directly');

select is(public.register_device('device-a-one-000000', 'Laptop', 'windows', '0.2.0'), 'ok', 'first device registers');
select is(public.register_device('device-a-one-000000', 'Laptop renamed', 'windows', '0.2.1'), 'ok', 're-registering the same device is fine');
select is(public.register_device('device-a-two-000000', 'Mac', 'macos', '0.2.0'), 'ok', 'second device registers (free limit is 2)');
select is(public.register_device('device-a-three-0000', 'Third', 'windows', '0.2.0'), 'limit_reached', 'a third device hits the free limit');
select is((select count(*) from public.devices), 2::bigint, 'the limit really stopped the insert');
select throws_ok($$select public.register_device('short', 'x', 'windows', '1')$$, '22023', null, 'an invalid device id is refused');

select set_config('t.a_device', (select id::text from public.devices where device_id = 'device-a-one-000000'), true);
select is(public.revoke_device((select id from public.devices where device_id = 'device-a-two-000000')), true, 'A revokes a device');
select is(public.register_device('device-a-two-000000', 'Mac', 'macos', '0.2.0'), 'revoked', 'a background heartbeat cannot revive a revoked device');
select is(public.register_device('device-a-three-0000', 'Third', 'windows', '0.2.0'), 'ok', 'revoking freed a slot');
select is(public.register_device('device-a-two-000000', 'Mac', 'macos', '0.2.0', true), 'revoked', 'an explicit sign-in cannot revive it while the plan has no free slot');
select is(public.revoke_device((select id from public.devices where device_id = 'device-a-three-0000')), true, 'A frees a slot again');
select is(public.register_device('device-a-two-000000', 'Mac', 'macos', '0.2.0', true), 'ok', 'an explicit sign-in on a revoked device re-adds it when a slot is free');

insert into public.user_preferences (user_id, data) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"theme":"dark"}');
select throws_ok($$insert into public.user_preferences (user_id, data) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{}')$$, '42501', null, 'A cannot write preferences for B');

-- ── user B ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is((select count(*) from public.devices), 0::bigint, 'B sees none of A''s devices');
select is((select count(*) from public.user_preferences), 0::bigint, 'B sees none of A''s preferences');
select is((select count(*) from public.profiles where display_name = 'Ada'), 0::bigint, 'B cannot see A''s profile data');
select is(public.revoke_device(current_setting('t.a_device')::uuid), false, 'B cannot revoke A''s device even knowing its id');
select is(public.revoke_device(gen_random_uuid()), false, 'revoking an unknown device changes nothing');
select is(pg_temp.affected($$update public.user_preferences set data = '{"theme":"light"}'$$), 0::bigint, 'B cannot update A''s preferences');
select is(pg_temp.affected($$delete from public.user_preferences$$), 0::bigint, 'B cannot delete A''s preferences');

-- ── anonymous ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.devices$$, '42501', null, 'anon cannot read devices');
select throws_ok($$select public.register_device('anon-device-00000000', 'x', 'windows', '1')$$, '42501', null, 'anon cannot call register_device');

select * from finish();
rollback;
