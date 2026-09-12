import { buildMarkets } from '../src/analysis/combinations';
import { sleep } from '../src/lib/retry';
import { ServiceError } from './errors';
import { buildSpotlight } from '../src/analysis/spotlight';
import { getOdds } from './providers/odds';
import type { Fixture, MatchData, Team } from '../src/domain/models';
import { before } from '../src/domain/models';
import { analyze } from '../src/analysis/engine';
import { analysisWeights } from '../src/analysis/config';
import { probabilities } from '../src/analysis/probability';
import type { FootballDataProvider } from './providers/provider';
import { Repository } from './repositories/supabase';
export class BusyError extends Error {}
export class FootballService {
  private inFlight = new Map<string, Promise<unknown>>();
  private async maintenance(operation: string, task: () => Promise<unknown>) {
    try {
      await task();
    } catch (error) {
      console.warn('Cache maintenance failed', {
        operation,
        code: error instanceof ServiceError ? error.code : 'UNKNOWN',
      });
    }
  }
  constructor(
    readonly provider: FootballDataProvider,
    readonly repo: Repository,
  ) {}
  async cached<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
    table = 'provider_cache',
  ): Promise<T> {
    const flightKey = `${table}:${key}`;
    const pending = this.inFlight.get(flightKey);
    if (pending) return pending as Promise<T>;
    const job = (async () => {
      const cached = await this.repo.cached<T>(key, table);
      if (cached !== null) return cached;
      if (!(await this.repo.lock(key))) {
        // Another instance owns the work. Wait for its result; never steal or release its lock.
        for (const delay of [200, 400, 800]) {
          await sleep(delay);
          const ready = await this.repo.cached<T>(key, table);
          if (ready !== null) return ready;
        }
        throw new BusyError(
          'Gegevens worden gesynchroniseerd. Probeer het over enkele seconden opnieuw.',
        );
      }
      try {
        const again = await this.repo.cached<T>(key, table);
        if (again !== null) return again;
        const data = await loader();
        await this.repo.cache(key, data, ttl, table);
        await this.maintenance('log', () => this.repo.log(key, 'success', this.provider.name));
        return data;
      } catch (error) {
        await this.maintenance('log', () => this.repo.log(key, 'error', this.provider.name));
        throw error;
      } finally {
        await this.maintenance('unlock', () => this.repo.unlock(key));
      }
    })();
    this.inFlight.set(flightKey, job);
    try {
      return await job;
    } finally {
      this.inFlight.delete(flightKey);
    }
  }
  private scope() {
    return (
      this.provider.cacheNamespace ??
      `${this.provider.name}:${process.env.SUPPORTED_LEAGUE_ID ?? '39'}:${process.env.FOOTBALL_SEASON ?? '2026'}`
    );
  }
  private ext(entity: { refs: { provider: string; externalId: string }[] }) {
    const ref = entity.refs.find((r) => r.provider === this.provider.name);
    if (!ref) throw new Error('Missing provider mapping');
    return ref.externalId;
  }
  leagues() {
    return this.cached(`${this.scope()}:leagues`, 86400, () => this.provider.leagues());
  }
  fixtures(date: string) {
    return this.cached(`${this.scope()}:fixtures:${date}`, 300, async () => {
      return this.repo.saveFixtures(await this.provider.fixtures(date));
    });
  }
  async fixture(id: string) {
    const saved = await this.repo.fixture(id);
    if (saved && !saved.refs.some((r) => r.provider === this.provider.name)) return null;
    if (saved?.status === 'finished') return saved;
    return this.cached(`${this.scope()}:fixture:${id}`, 120, async () => {
      const prefix = this.provider.fixtureIdPrefix;
      const ext = saved
        ? this.ext(saved)
        : prefix && id.startsWith(prefix)
          ? id.slice(prefix.length)
          : null;
      if (!ext) return null;
      const raw = await this.provider.fixture(ext);
      if (!raw) return null;
      const leagues = await this.leagues();
      if (!leagues.some((l) => l.id === raw.league.id)) return null;
      return (await this.repo.saveFixtures([raw]))[0];
    });
  }
  async history(team: Team, kickoff: string) {
    const fixtures = await this.cached(
      `${this.scope()}:history:${team.id}:${kickoff.slice(0, 10)}`,
      21600,
      async () => {
        return this.repo.saveFixtures(await this.provider.history(this.ext(team), kickoff));
      },
    );
    return this.repo.withStats(
      before(fixtures, kickoff),
      this.provider.statisticsProvider ?? this.provider.name,
    );
  }
  async h2h(f: Fixture) {
    return this.cached(
      `${this.scope()}:h2h:${f.home.id}:${f.away.id}:${f.kickoff.slice(0, 10)}`,
      86400,
      async () => {
        return before(
          await this.repo.saveFixtures(
            await this.provider.h2h(this.ext(f.home), this.ext(f.away), f.kickoff),
          ),
          f.kickoff,
        );
      },
      'h2h_cache',
    );
  }
  async data(id: string): Promise<MatchData | null> {
    const fixture = await this.fixture(id);
    if (!fixture) return null;
    const { homeHistory, awayHistory, h2h } = this.provider.matchHistory
      ? await this.cached(
          `${this.scope()}:match-history:v1:${id}:${fixture.kickoff}`,
          21600,
          async () => {
            const groups = await this.provider.matchHistory!(
              this.ext(fixture.home),
              this.ext(fixture.away),
              fixture.kickoff,
            );
            const unique = [
              ...new Map(
                Object.values(groups)
                  .flat()
                  .map((f) => [f.id, f]),
              ).values(),
            ];
            const saved = await this.repo.saveFixtures(unique);
            const byOriginalId = new Map(unique.map((f, index) => [f.id, saved[index]]));
            const canonical = (rows: Fixture[]) =>
              before(
                rows.map((f) => byOriginalId.get(f.id)!),
                fixture.kickoff,
              );
            return {
              homeHistory: canonical(groups.homeHistory),
              awayHistory: canonical(groups.awayHistory),
              h2h: canonical(groups.h2h),
            };
          },
        )
      : {
          homeHistory: await this.history(fixture.home, fixture.kickoff),
          awayHistory: await this.history(fixture.away, fixture.kickoff),
          h2h: await this.h2h(fixture),
        };
    return {
      fixture,
      homeHistory,
      awayHistory,
      h2h,
      source: 'live',
      sourceLabel: this.provider.label ?? 'API-Football',
      updatedAt: new Date().toISOString(),
      warnings: [
        ...(this.provider.warnings ?? [
          'Historie is beperkt tot het ingestelde competitieseizoen. Geavanceerde statistieken verschijnen na expliciete synchronisatie; beschikbaarheid hangt af van providerdekking.',
        ]),
        ...new Set(
          [fixture, ...homeHistory, ...awayHistory, ...h2h].flatMap(
            (f) => f.provenance?.conflicts ?? [],
          ),
        ),
      ],
    };
  }
  async analysis(id: string) {
    return this.cached(
      `${this.scope()}:analysis:${analysisWeights.version}:${id}`,
      900,
      async () => {
        const data = await this.data(id);
        if (!data) return null;
        const analysis = analyze(data);
        return { data, analysis, probabilities: probabilities(data, analysis) };
      },
      'analysis_results',
    );
  }
  async markets(date: string, window: number) {
    const matches = await this.cached(`${this.scope()}:markets-data:v1:${date}`, 900, async () => {
      if (this.provider.previewData) return this.provider.previewData(date);
      const rows: MatchData[] = [];
      for (const fixture of (await this.fixtures(date)).slice(0, 10)) {
        const data = await this.data(fixture.id);
        if (data) rows.push(data);
      }
      return rows;
    });
    const odds = await getOdds(this).catch(() => ({
      source: 'Geen odds beschikbaar',
      kind: 'snapshot' as const,
      fetchedAt: new Date().toISOString(),
      quotes: [],
      message:
        'Bookmakerodds zijn tijdelijk niet beschikbaar. Historische selecties blijven zichtbaar.',
    }));
    return buildMarkets(matches, odds, window);
  }
  async spotlight(date: string) {
    const matches = await this.cached(
      `${this.scope()}:spotlight-models:v1:${date}`,
      900,
      async () => {
        if (this.provider.previewData)
          return (await this.provider.previewData(date)).map((data) => {
            const analysis = analyze(data);
            return {
              fixture: data.fixture,
              probabilities: probabilities(data, analysis),
              homeSamples: analysis.home[2].available,
              awaySamples: analysis.away[2].available,
            };
          });
        const results = [];
        for (const fixture of (await this.fixtures(date)).slice(0, 10)) {
          const result = await this.analysis(fixture.id);
          if (result)
            results.push({
              fixture: result.data.fixture,
              probabilities: result.probabilities,
              homeSamples: result.analysis.home[2].available,
              awaySamples: result.analysis.away[2].available,
            });
        }
        return results;
      },
    );
    const odds = await getOdds(this).catch(() => ({
      source: 'Geen odds beschikbaar',
      kind: 'snapshot' as const,
      fetchedAt: new Date().toISOString(),
      quotes: [],
      message: 'Bookmakerodds zijn tijdelijk niet beschikbaar. De modelkansen blijven zichtbaar.',
    }));
    return buildSpotlight(matches, odds);
  }
  async sync(id: string) {
    const f = await this.fixture(id);
    if (!f) return null;
    if (f.status !== 'finished')
      return {
        fixture: f,
        statisticsSynced: false,
        message: 'Statistieken worden pas na afloop permanent opgeslagen.',
      };
    return this.cached(`${this.scope()}:sync:${id}`, 86400, async () => {
      const existing = await this.repo.stats(
        id,
        this.provider.statisticsProvider ?? this.provider.name,
      );
      const statistics = existing ?? (await this.provider.statistics(f));
      const updated = { ...f, statistics };
      await this.repo.saveFixture(updated);
      await this.repo.saveStats(updated, this.provider.statisticsProvider ?? this.provider.name);
      if ((await this.repo.events(id, this.provider.name)) === null)
        await this.repo.saveEvents(id, this.provider.name, await this.provider.events(this.ext(f)));
      const { error } = await this.repo.db
        .from('analysis_results')
        .delete()
        .like('cache_key', `${this.scope()}:analysis:%`);
      if (error) throw error;
      return { fixture: updated, statisticsSynced: statistics !== null };
    });
  }
}
