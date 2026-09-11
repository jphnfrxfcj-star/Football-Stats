-- Apply using Supabase SQL editor or `supabase db push`.
create extension if not exists pgcrypto;
create table leagues (id text primary key default gen_random_uuid()::text, name text not null, country text not null, data jsonb not null);
create table teams (id text primary key default gen_random_uuid()::text, name text not null, data jsonb not null);
create table fixtures (id text primary key default gen_random_uuid()::text, league_id text not null references leagues(id), home_team_id text not null references teams(id), away_team_id text not null references teams(id), kickoff timestamptz not null, status text not null, data jsonb not null, updated_at timestamptz not null default now());
-- These mapping tables allow multiple providers to resolve to one canonical internal ID.
create table league_provider_ids (provider text not null, provider_league_id text not null, league_id text not null references leagues(id), primary key(provider,provider_league_id));
create table team_provider_ids (provider text not null, provider_team_id text not null, team_id text not null references teams(id), primary key(provider,provider_team_id));
create table fixture_provider_ids (provider text not null, provider_fixture_id text not null, fixture_id text not null references fixtures(id), primary key(provider,provider_fixture_id));
create table fixture_statistics (fixture_id text not null references fixtures(id), provider text not null, data jsonb not null, synced_at timestamptz not null default now(), primary key(fixture_id,provider));
create table fixture_events (fixture_id text not null references fixtures(id), provider text not null, data jsonb not null, synced_at timestamptz not null default now(), primary key(fixture_id,provider));
create table team_match_stats (fixture_id text not null references fixtures(id), team_id text not null references teams(id), provider text not null, data jsonb not null, primary key(fixture_id,team_id,provider));
create table h2h_cache (cache_key text primary key, data jsonb not null, expires_at timestamptz not null);
create table analysis_results (cache_key text primary key, data jsonb not null, expires_at timestamptz not null);
create table provider_cache (cache_key text primary key, data jsonb not null, expires_at timestamptz not null);
create table provider_sync_log (id bigint generated always as identity primary key, provider text not null, resource text not null, status text not null, created_at timestamptz not null default now());
create table sync_locks (cache_key text primary key, expires_at timestamptz not null);
create table api_rate_limits (bucket text primary key, count integer not null, expires_at timestamptz not null);
create index fixtures_kickoff_idx on fixtures(kickoff);
create index fixtures_home_idx on fixtures(home_team_id,kickoff desc);
create index fixtures_away_idx on fixtures(away_team_id,kickoff desc);
create or replace function acquire_sync_lock(lock_key text) returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into sync_locks(cache_key,expires_at) values(lock_key,now()+interval '90 seconds') on conflict(cache_key) do update set expires_at=excluded.expires_at where sync_locks.expires_at<now();
  return found;
end; $$;
create or replace function check_rate_limit(bucket_key text, max_requests integer, window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare current_count integer;
begin
  insert into api_rate_limits(bucket,count,expires_at) values(bucket_key,1,now()+make_interval(secs=>window_seconds)) on conflict(bucket) do update set count=case when api_rate_limits.expires_at<now() then 1 else api_rate_limits.count+1 end, expires_at=case when api_rate_limits.expires_at<now() then now()+make_interval(secs=>window_seconds) else api_rate_limits.expires_at end returning count into current_count;
  return current_count<=max_requests;
end; $$;
-- No browser has access. Functions use the server-only service role.
do $$ declare t text; begin foreach t in array array['leagues','teams','fixtures','league_provider_ids','team_provider_ids','fixture_provider_ids','fixture_statistics','fixture_events','team_match_stats','h2h_cache','analysis_results','provider_cache','provider_sync_log','sync_locks','api_rate_limits'] loop execute format('alter table %I enable row level security',t); execute format('revoke all on table %I from anon, authenticated',t); end loop; end $$;
revoke all on function acquire_sync_lock(text) from public,anon,authenticated;
revoke all on function check_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function acquire_sync_lock(text) to service_role;
grant execute on function check_rate_limit(text,integer,integer) to service_role;
