import type { Fixture, League, MatchEvent, TeamMetrics } from '../../src/domain/models';
export interface FootballDataProvider {
  readonly name: string;
  readonly cacheNamespace?: string;
  readonly label?: string;
  readonly fixtureIdPrefix?: string;
  readonly statisticsProvider?: string;
  readonly warnings?: string[];
  leagues(): Promise<League[]>;
  fixtures(date: string): Promise<Fixture[]>;
  fixture(externalId: string): Promise<Fixture | null>;
  history(teamExternalId: string, beforeDate: string): Promise<Fixture[]>;
  h2h(homeExternalId: string, awayExternalId: string, beforeDate: string): Promise<Fixture[]>;
  statistics(fixture: Fixture): Promise<{ home: TeamMetrics; away: TeamMetrics } | null>;
  events(fixtureExternalId: string): Promise<MatchEvent[]>;
}
