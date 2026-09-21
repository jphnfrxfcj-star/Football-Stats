import {
  competitions,
  competitionLeague,
  divisions,
  fixtureDivision,
  type Division,
} from '../../src/domain/competitions';
import { before, type Fixture, type MatchData } from '../../src/domain/models';
import type { Repository } from '../repositories/supabase';
import { ServiceError, sourceUnavailable } from '../errors';
import {
  FreeFootballProvider,
  normalizeSchedule,
  type SourceReader,
  type SourceDocument,
} from './free-football';
import { downloadOrg, normalizeOrg, orgUrl } from './football-data-org';
import type { MultiLeagueProvider } from './multi-league';
import type { FootballDataProvider } from './provider';

type Cache = <T>(key: string, ttl: number, load: () => Promise<T>) => Promise<T>;
export class ResilientFootballProvider implements FootballDataProvider {
  readonly name = 'free-football';
  readonly fixtureIdPrefix = 'free-fixture-';
  readonly statisticsProvider = 'football-data-co-uk';
  readonly label = 'OpenFootball + Football-Data.co.uk + ESPN; Football-data.org als terugvalbron';
  readonly cacheNamespace: string;
  get warnings() {
    return this.primary.warnings;
  }
  private failedUntil = 0;
  constructor(
    private year: number,
    private primary: MultiLeagueProvider,
    private repo: Repository,
    private read: SourceReader,
    private cache: Cache,
    private orgKey = '',
  ) {
    this.cacheNamespace = `free-football:multi:v4:${year}`;
  }
  private async resilient<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (Date.now() < this.failedUntil) return fallback();
    try {
      return await primary();
    } catch (error) {
      if (!sourceUnavailable(error)) throw error;
      this.failedUntil = Date.now() + 60000;
      return fallback();
    }
  }
  private async orgSeason(year: number, division: Division): Promise<Fixture[]> {
    const doc = await this.cache<SourceDocument>(
      `football-data-org:v1:${year}:${division}`,
      year === this.year ? 900 : 86400,
      async () => {
        if (!(await this.repo.rateLimit('provider:football-data-org', 9, 60)))
          throw new ServiceError(
            'ORG_RATE_LIMIT',
            'De alternatieve databron wordt tijdelijk begrensd.',
          );
        const doc = await downloadOrg(orgUrl(year, division), this.orgKey);
        if (!normalizeOrg(doc, year, division).length)
          throw new ServiceError(
            'ORG_FORMAT_CHANGED',
            'De alternatieve databron bevat geen seizoensprogramma.',
          );
        return doc;
      },
    );
    return normalizeOrg(doc, year, division);
  }
  private season(division: Division): Promise<Fixture[]> {
    return this.cache(`fallback-season:v1:${this.year}:${division}`, 120, async () => {
      if (this.orgKey) {
        try {
          return await this.orgSeason(this.year, division);
        } catch (error) {
          if (error instanceof ServiceError && error.code.startsWith('SUPABASE_')) throw error;
          console.warn('Alternative schedule unavailable', {
            division,
            code: error instanceof ServiceError ? error.code : 'ORG_UNAVAILABLE',
          });
        }
      }
      try {
        const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${this.year}-${String(this.year + 1).slice(-2)}/${competitions[division].file}.1.json`;
        const doc = await this.read(url, 3600);
        const fixtures = normalizeSchedule(doc, this.year, url, division);
        if (!fixtures.length)
          throw new ServiceError('FREE_SOURCE_UNAVAILABLE', 'Geen seizoensprogramma beschikbaar.');
        return fixtures.map((f) => ({
          ...f,
          availability: {
            status: 'fallback' as const,
            source: 'OpenFootball',
            updatedAt: doc.fetchedAt,
          },
        }));
      } catch (error) {
        if (
          !sourceUnavailable(error) &&
          !(error instanceof ServiceError && error.code === 'SOURCE_FORMAT_CHANGED')
        )
          throw error;
        const stored = await this.repo.storedSeason(competitionLeague(division).id, this.year);
        if (!stored.length) throw error;
        return stored;
      }
    });
  }
  seasonFixtures(division: Division) {
    return this.resilient(
      () => new FreeFootballProvider(this.year, this.read, division).seasonFixtures(),
      () => this.season(division),
    );
  }
  leagues() {
    return this.primary.leagues();
  }
  fixtures(date: string) {
    return this.resilient(
      () => this.primary.fixtures(date),
      async () =>
        (await Promise.all(divisions.map((d) => this.season(d))))
          .flat()
          .filter((f) => f.sourceDate === date)
          .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    );
  }
  fixture(id: string) {
    return this.resilient(
      () => this.primary.fixture(id),
      async () =>
        (await Promise.all(divisions.map((d) => this.season(d))))
          .flat()
          .find((f) => f.refs.some((r) => r.provider === this.name && r.externalId === id)) ?? null,
    );
  }
  private async storedData(fixture: Fixture): Promise<MatchData> {
    const division = fixtureDivision(fixture);
    const cutoff = new Date(Math.min(Date.now(), Date.parse(fixture.kickoff))).toISOString();
    const [season, stored] = await Promise.all([
      this.season(division),
      this.cache(`stored-history:v1:${division}:${cutoff.slice(0, 10)}`, 120, () =>
        this.repo.storedLeagueHistory(competitionLeague(division).id, cutoff),
      ),
    ]);
    let previous: Fixture[] | null = null;
    if (this.orgKey && season.every((f) => f.availability?.source === 'Football-data.org')) {
      try {
        previous = await this.orgSeason(this.year - 1, division);
      } catch (error) {
        if (error instanceof ServiceError && error.code.startsWith('SUPABASE_')) throw error;
        console.warn('Alternative history unavailable', {
          division,
          code: error instanceof ServiceError ? error.code : 'ORG_UNAVAILABLE',
        });
      }
    }
    const includes = (f: Fixture, id: string) => f.home.id === id || f.away.id === id;
    const relevant = (f: Fixture) => includes(f, fixture.home.id) || includes(f, fixture.away.id);
    const fresh = [...(previous ?? []), ...season];
    const verified =
      previous !== null &&
      fixture.availability?.status !== 'stale' &&
      !fresh.some(
        (f) =>
          relevant(f) &&
          Date.parse(f.kickoff) < Date.parse(cutoff) &&
          (['scheduled', 'live'].includes(f.status) ||
            (f.status === 'finished' && (f.homeGoals === null || f.awayGoals === null))),
      );
    const known = new Map(stored.map((f) => [f.id, f]));
    // For automatic proposals use only the two fully retrieved seasons, never fill gaps with older partial history.
    const rows = new Map((verified ? [] : stored).map((f) => [f.id, f]));
    for (const f of fresh) {
      if (f.status !== 'finished') continue;
      const old = known.get(f.id);
      rows.set(f.id, {
        ...f,
        statistics:
          old?.homeGoals === f.homeGoals && old?.awayGoals === f.awayGoals ? old.statistics : null,
      });
    }
    const history = before([...rows.values()], cutoff);
    const homeHistory = history.filter((f) => includes(f, fixture.home.id)).slice(0, 60);
    const awayHistory = history.filter((f) => includes(f, fixture.away.id)).slice(0, 60);
    const h2h = history
      .filter((f) => includes(f, fixture.home.id) && includes(f, fixture.away.id))
      .slice(0, 10);
    const dates = [...homeHistory, ...awayHistory]
      .map((f) => f.availability?.updatedAt)
      .filter((d): d is string => !!d)
      .sort();
    const updatedAt = dates[0] ?? null;
    return {
      fixture,
      homeHistory,
      awayHistory,
      h2h,
      source: 'live',
      sourceLabel: this.label,
      updatedAt: updatedAt ?? new Date().toISOString(),
      availability: {
        status: verified ? 'fallback' : 'partial',
        source: verified ? 'Football-data.org' : 'Opgeslagen historie en beschikbare uitslagen',
        updatedAt,
      },
      warnings: [
        verified
          ? 'Alternatieve historie: huidig en vorig seizoen. Alleen beschikbare uitslagen tellen mee; ontbrekende ruststanden en statistieken blijven onbekend.'
          : 'Historie kon niet volledig worden vernieuwd. Opgeslagen gegevens en beschikbare uitslagen worden getoond; automatische combivoorstellen zijn uitgeschakeld.',
      ],
    };
  }
  fallbackData(id: string): Promise<MatchData | null> {
    return this.fixture(id).then((f) => (f ? this.storedData(f) : null));
  }
  previewData(date: string) {
    return this.previewRange(date, 1);
  }
  previewRange(date: string, days: number): Promise<MatchData[]> {
    return this.resilient(
      () => this.primary.previewRange(date, days),
      async () => {
        const end = new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
        const season = (await Promise.all(divisions.map((d) => this.season(d)))).flat();
        return Promise.all(
          season
            .filter((f) => f.sourceDate! >= date && f.sourceDate! < end)
            .map((f) => this.storedData(f)),
        );
      },
    );
  }
  matchHistory(home: string, away: string, cutoff: string) {
    return this.primary.matchHistory(home, away, cutoff);
  }
  history(team: string, cutoff: string) {
    return this.primary.history(team, cutoff);
  }
  h2h(home: string, away: string, cutoff: string) {
    return this.primary.h2h(home, away, cutoff);
  }
  statistics(f: Fixture) {
    return this.primary.statistics(f);
  }
  events() {
    return this.primary.events();
  }
}
