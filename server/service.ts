import type { Fixture, MatchData, Team } from '../src/domain/models';
import { before } from '../src/domain/models';
import { analyze } from '../src/analysis/engine';
import { analysisWeights } from '../src/analysis/config';
import { probabilities } from '../src/analysis/probability';
import type { FootballDataProvider } from './providers/provider';
import { Repository } from './repositories/supabase';
const inFlight = new Map<string, Promise<unknown>>();
export class BusyError extends Error {}
export class FootballService {
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
    const cached = await this.repo.cached<T>(key, table);
    if (cached !== null) return cached;
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const job = (async () => {
      if (!(await this.repo.lock(key)))
        throw new BusyError(
          'Gegevens worden gesynchroniseerd. Probeer het over enkele seconden opnieuw.',
        );
      try {
        const again = await this.repo.cached<T>(key, table);
        if (again !== null) return again;
        const data = await loader();
        await this.repo.cache(key, data, ttl, table);
        await this.repo.log(key, 'success');
        return data;
      } catch (error) {
        await this.repo.log(key, 'error');
        throw error;
      } finally {
        await this.repo.unlock(key);
      }
    })();
    inFlight.set(key, job);
    try {
      return await job;
    } finally {
      inFlight.delete(key);
    }
  }
  private scope() {
    return `${this.provider.name}:${process.env.SUPPORTED_LEAGUE_ID ?? '39'}:${process.env.FOOTBALL_SEASON ?? '2026'}`;
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
    if (saved?.status === 'finished') return saved;
    return this.cached(`${this.scope()}:fixture:${id}`, 120, async () => {
      const ext = saved ? this.ext(saved) : id.match(/^af-fixture-(\d+)$/)?.[1];
      if (!ext) return null;
      const raw = await this.provider.fixture(ext);
      if (!raw || raw.league.refs[0].externalId !== (process.env.SUPPORTED_LEAGUE_ID ?? '39'))
        return null;
      return this.repo.saveFixture(raw);
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
    return this.repo.withStats(before(fixtures, kickoff), this.provider.name);
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
    const homeHistory = await this.history(fixture.home, fixture.kickoff),
      awayHistory = await this.history(fixture.away, fixture.kickoff),
      h2h = await this.h2h(fixture);
    return {
      fixture,
      homeHistory,
      awayHistory,
      h2h,
      source: 'live',
      updatedAt: new Date().toISOString(),
      warnings: [
        'Historie is beperkt tot het ingestelde competitieseizoen. Geavanceerde statistieken verschijnen na expliciete synchronisatie; beschikbaarheid hangt af van providerdekking.',
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
      const existing = await this.repo.stats(id, this.provider.name);
      const statistics = existing ?? (await this.provider.statistics(f));
      const updated = { ...f, statistics };
      await this.repo.saveFixture(updated);
      await this.repo.saveStats(updated, this.provider.name);
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
