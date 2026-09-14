import { preserveResult } from './preserve-result';
import { databaseFetch, rollbackCodes } from './database-fetch';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '../errors';
import type { Fixture, League, ProviderRef, Team } from '../../src/domain/models';
export class Repository {
  readonly db: SupabaseClient;
  constructor(url: string, key: string) {
    this.db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { retry: false },
      global: { fetch: databaseFetch() },
    });
  }
  private assert(error: { message: string; code?: string } | null) {
    if (!error) return;
    const code = error.code ?? '';
    if (
      ['PGRST301', 'PGRST302', 'PGRST303', '42501', '28P01'].includes(code) ||
      /invalid api key|invalid jwt/i.test(error.message)
    )
      throw new ServiceError(
        'SUPABASE_AUTH_FAILED',
        'Supabase weigert de serversleutel of databasepermissies. Controleer SUPABASE_SERVICE_ROLE_KEY in Netlify Functions.',
      );
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(code))
      throw new ServiceError(
        'SUPABASE_SCHEMA_MISSING',
        'Een Supabase-tabel of databasefunctie ontbreekt. Voer de volledige database-migratie uit.',
      );
    if (
      code === 'GATEWAY_CLOCK_SKEW' ||
      rollbackCodes.has(code) ||
      /fetch failed|network|timeout|timed out|aborterror/i.test(error.message)
    )
      throw new ServiceError(
        'SUPABASE_TEMPORARY_UNAVAILABLE',
        'De database is tijdelijk bezet of niet bereikbaar. Probeer het over enkele seconden opnieuw.',
      );
    throw new ServiceError(
      'SUPABASE_REQUEST_FAILED',
      'Het ophalen of opslaan van de gegevens is niet gelukt. Probeer het opnieuw.',
    );
  }
  async cached<T>(key: string, table = 'provider_cache'): Promise<T | null> {
    const { data, error } = await this.db
      .from(table)
      .select('data,expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    this.assert(error);
    return data && Date.parse(data.expires_at) > Date.now() ? (data.data as T) : null;
  }
  async cache(key: string, data: unknown, ttl: number, table = 'provider_cache') {
    const { error } = await this.db.from(table).upsert({
      cache_key: key,
      data,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    });
    this.assert(error);
  }
  async lock(key: string) {
    const { data, error } = await this.db.rpc('acquire_sync_lock', { lock_key: key });
    this.assert(error);
    return data === true;
  }
  async unlock(key: string) {
    const { error } = await this.db.from('sync_locks').delete().eq('cache_key', key);
    this.assert(error);
  }
  async rateLimit(bucket: string, max = 60, seconds = 60) {
    const { data, error } = await this.db.rpc('check_rate_limit', {
      bucket_key: bucket,
      max_requests: max,
      window_seconds: seconds,
    });
    this.assert(error);
    return data === true;
  }
  async log(resource: string, status: string, provider = 'api-football') {
    const { error } = await this.db
      .from('provider_sync_log')
      .insert({ provider, resource, status });
    this.assert(error);
  }
  async resolve(kind: 'team' | 'league' | 'fixture', refs: ProviderRef[], fallback: string) {
    for (const ref of refs) {
      const { data, error } = await this.db
        .from(`${kind}_provider_ids`)
        .select(`${kind}_id`)
        .eq('provider', ref.provider)
        .eq(`provider_${kind}_id`, ref.externalId)
        .maybeSingle();
      this.assert(error);
      if (data) return String((data as unknown as Record<string, unknown>)[`${kind}_id`]);
    }
    return fallback;
  }
  async mapping(kind: 'team' | 'league' | 'fixture', id: string, refs: ProviderRef[]) {
    for (const ref of refs) {
      const { error } = await this.db.from(`${kind}_provider_ids`).upsert({
        provider: ref.provider,
        [`provider_${kind}_id`]: ref.externalId,
        [`${kind}_id`]: id,
      });
      this.assert(error);
    }
  }
  async entity(kind: 'team' | 'league', value: Team | League) {
    const id = await this.resolve(kind, value.refs, value.id),
      data = { ...value, id };
    const { error } = await this.db.from(`${kind}s`).upsert({
      id,
      name: value.name,
      ...(kind === 'league' ? { country: (value as League).country } : {}),
      data,
    });
    this.assert(error);
    await this.mapping(kind, id, value.refs);
    return data;
  }
  async saveFixture(input: Fixture): Promise<Fixture> {
    const home = (await this.entity('team', input.home)) as Team,
      away = (await this.entity('team', input.away)) as Team,
      league = (await this.entity('league', input.league)) as League;
    const id = await this.resolve('fixture', input.refs, input.id);
    const data = { ...input, id, home, away, league };
    const { error } = await this.db.from('fixtures').upsert({
      id,
      league_id: league.id,
      home_team_id: home.id,
      away_team_id: away.id,
      kickoff: data.kickoff,
      status: data.status,
      data,
      updated_at: new Date().toISOString(),
    });
    this.assert(error);
    await this.mapping('fixture', id, input.refs);
    return data;
  }
  async saveFixtures(inputs: Fixture[]): Promise<Fixture[]> {
    if (!inputs.length) return [];
    const maps = new Map<string, string>();
    for (const kind of ['team', 'league', 'fixture'] as const) {
      const entities =
        kind === 'team'
          ? inputs.flatMap((f) => [f.home, f.away])
          : kind === 'league'
            ? inputs.map((f) => f.league)
            : inputs;
      const refs = entities.flatMap((e) => e.refs);
      for (const provider of new Set(refs.map((r) => r.provider))) {
        const ids = [
          ...new Set(refs.filter((r) => r.provider === provider).map((r) => r.externalId)),
        ];
        const { data, error } = await this.db
          .from(`${kind}_provider_ids`)
          .select(`provider_${kind}_id,${kind}_id`)
          .eq('provider', provider)
          .in(`provider_${kind}_id`, ids);
        this.assert(error);
        for (const item of data ?? []) {
          const row = item as unknown as Record<string, string>;
          maps.set(`${kind}:${provider}:${row[`provider_${kind}_id`]}`, row[`${kind}_id`]);
        }
      }
    }
    const canonical = <T extends { id: string; refs: ProviderRef[] }>(
      kind: string,
      entity: T,
    ): T => ({
      ...entity,
      id:
        entity.refs.map((r) => maps.get(`${kind}:${r.provider}:${r.externalId}`)).find(Boolean) ??
        entity.id,
    });
    let fixtures = inputs.map((f) => ({
      ...canonical('fixture', f),
      home: canonical('team', f.home),
      away: canonical('team', f.away),
      league: canonical('league', f.league),
    }));
    const incomplete = fixtures.filter(
      (f) => f.status !== 'finished' || f.homeGoals === null || f.awayGoals === null,
    );
    if (incomplete.length) {
      const { data: stored, error } = await this.db
        .from('fixtures')
        .select('id,data')
        .eq('status', 'finished')
        .in(
          'id',
          incomplete.map((f) => f.id),
        );
      this.assert(error);
      const known = new Map((stored ?? []).map((row) => [row.id, row.data as Fixture]));
      fixtures = fixtures.map((f) => preserveResult(f, known.get(f.id)));
    }
    const teams = [
      ...new Map(fixtures.flatMap((f) => [f.home, f.away]).map((t) => [t.id, t])).values(),
    ];
    const leagues = [...new Map(fixtures.map((f) => [f.league.id, f.league])).values()];
    for (const [table, rows] of [
      ['leagues', leagues.map((l) => ({ id: l.id, name: l.name, country: l.country, data: l }))],
      ['teams', teams.map((t) => ({ id: t.id, name: t.name, data: t }))],
      [
        'fixtures',
        fixtures.map((f) => ({
          id: f.id,
          league_id: f.league.id,
          home_team_id: f.home.id,
          away_team_id: f.away.id,
          kickoff: f.kickoff,
          status: f.status,
          data: f,
          updated_at: new Date().toISOString(),
        })),
      ],
    ] as const) {
      const { error } = await this.db.from(table).upsert(rows as Record<string, unknown>[]);
      this.assert(error);
    }
    for (const [kind, entities] of [
      ['league', leagues],
      ['team', teams],
      ['fixture', fixtures],
    ] as const) {
      const rows = [
        ...new Map(
          entities
            .flatMap((e) =>
              e.refs.map((r) => ({
                provider: r.provider,
                [`provider_${kind}_id`]: r.externalId,
                [`${kind}_id`]: e.id,
              })),
            )
            .map((r) => [`${r.provider}:${r[`provider_${kind}_id`]}`, r]),
        ).values(),
      ];
      if (rows.length) {
        const { error } = await this.db.from(`${kind}_provider_ids`).upsert(rows);
        this.assert(error);
      }
    }
    // Inline CSV metrics are already fetched; persist them in the normalized per-provider tables.
    const enriched = fixtures.filter((f) => f.statistics && f.provenance?.fields.statistics);
    if (enriched.length) {
      const stats = enriched.map((f) => ({
        fixture_id: f.id,
        provider: f.provenance!.fields.statistics!,
        data: f.statistics,
      }));
      const result = await this.db.from('fixture_statistics').upsert(stats);
      this.assert(result.error);
      const teamStats = enriched.flatMap((f) =>
        (['home', 'away'] as const).map((side) => ({
          fixture_id: f.id,
          team_id: f[side].id,
          provider: f.provenance!.fields.statistics!,
          data: f.statistics![side],
        })),
      );
      const teamsResult = await this.db.from('team_match_stats').upsert(teamStats);
      this.assert(teamsResult.error);
    }
    return fixtures;
  }
  async withStats(fixtures: Fixture[], provider: string): Promise<Fixture[]> {
    if (!fixtures.length) return [];
    const { data, error } = await this.db
      .from('fixture_statistics')
      .select('fixture_id,data')
      .eq('provider', provider)
      .in(
        'fixture_id',
        fixtures.map((f) => f.id),
      );
    this.assert(error);
    const map = new Map((data ?? []).map((r) => [r.fixture_id, r.data as Fixture['statistics']]));
    return fixtures.map((f) => ({ ...f, statistics: map.get(f.id) ?? f.statistics }));
  }
  async fixture(id: string): Promise<Fixture | null> {
    const { data, error } = await this.db
      .from('fixtures')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    this.assert(error);
    return data?.data ?? null;
  }
  async team(id: string): Promise<Team | null> {
    const { data, error } = await this.db.from('teams').select('data').eq('id', id).maybeSingle();
    this.assert(error);
    return data?.data ?? null;
  }
  async saveStats(f: Fixture, provider: string) {
    if (!f.statistics) return;
    const { error } = await this.db
      .from('fixture_statistics')
      .upsert({ fixture_id: f.id, provider, data: f.statistics });
    this.assert(error);
    for (const side of ['home', 'away'] as const) {
      const result = await this.db
        .from('team_match_stats')
        .upsert({ fixture_id: f.id, team_id: f[side].id, provider, data: f.statistics[side] });
      this.assert(result.error);
    }
  }
  async stats(id: string, provider: string) {
    const { data, error } = await this.db
      .from('fixture_statistics')
      .select('data')
      .eq('fixture_id', id)
      .eq('provider', provider)
      .maybeSingle();
    this.assert(error);
    return (data?.data as Fixture['statistics']) ?? null;
  }
  async events(id: string, provider: string): Promise<unknown[] | null> {
    const { data, error } = await this.db
      .from('fixture_events')
      .select('data')
      .eq('fixture_id', id)
      .eq('provider', provider)
      .maybeSingle();
    this.assert(error);
    return data?.data ?? null;
  }
  async saveEvents(id: string, provider: string, events: unknown) {
    const { error } = await this.db
      .from('fixture_events')
      .upsert({ fixture_id: id, provider, data: events });
    this.assert(error);
  }
}
