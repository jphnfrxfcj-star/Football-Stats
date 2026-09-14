import { divisions, italianClubs, frenchClubs } from '../../src/domain/competitions';
import { FreeFootballProvider, type SourceReader } from './free-football';
import { spanishClubs, spanishSlug } from '../../src/domain/spanish-clubs';
import type { FootballDataProvider } from './provider';
import type { Fixture } from '../../src/domain/models';
export class MultiLeagueProvider implements FootballDataProvider {
  readonly name = 'free-football';
  readonly fixtureIdPrefix = 'free-fixture-';
  readonly statisticsProvider = 'football-data-co-uk';
  readonly label =
    'OpenFootball + Football-Data.co.uk + ESPN · Premier League · La Liga · Serie A · Ligue 1';
  readonly warnings = [
    'Periodieke bronupdates, geen livescores.',
    'Maximaal vijf seizoenen per competitie; gepromoveerde teams kunnen minder historie hebben.',
  ];
  readonly cacheNamespace: string;
  private providers: FreeFootballProvider[];
  constructor(year: number, read?: SourceReader) {
    this.cacheNamespace = `free-football:multi:v2:${year}`;
    this.providers = divisions.map((d) => new FreeFootballProvider(year, read, d));
  }
  private forTeam(slug: string) {
    const groups = [spanishClubs, italianClubs, frenchClubs];
    const index = groups.findIndex((clubs) =>
      Object.keys(clubs).some((n) => spanishSlug(n) === slug),
    );
    return this.providers[index < 0 ? 0 : index + 1];
  }
  async leagues() {
    return (await Promise.all(this.providers.map((p) => p.leagues()))).flat();
  }
  async fixtures(date: string) {
    return (await Promise.all(this.providers.map((p) => p.fixtures(date))))
      .flat()
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }
  fixture(id: string) {
    return this.forTeam(id.replace(/^\d{4}-/, '').split('-vs-')[0]).fixture(id);
  }
  history(team: string, cutoff: string) {
    return this.forTeam(team).history(team, cutoff);
  }
  h2h(home: string, away: string, cutoff: string) {
    return this.forTeam(home).h2h(home, away, cutoff);
  }
  matchHistory(home: string, away: string, cutoff: string) {
    return this.forTeam(home).matchHistory(home, away, cutoff);
  }
  async previewData(date: string) {
    return (await Promise.all(this.providers.map((p) => p.previewData(date)))).flat();
  }
  async previewRange(date: string, days: number) {
    return (await Promise.all(this.providers.map((p) => p.previewRange(date, days)))).flat();
  }
  async statistics(f: Fixture) {
    return f.statistics;
  }
  async events() {
    return [];
  }
}
