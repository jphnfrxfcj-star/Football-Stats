import type { Fixture, League, MatchEvent, TeamMetrics, MatchData } from '../../src/domain/models';
export interface FootballDataProvider {
  readonly name: string;
  readonly cacheNamespace?: string;
  readonly label?: string;
  readonly fixtureIdPrefix?: string;
  readonly statisticsProvider?: string;
  readonly warnings?: string[];
  fallbackData?(externalId: string): Promise<MatchData | null>;
  leagues(): Promise<League[]>;
  fixtures(date: string): Promise<Fixture[]>;
  fixture(externalId: string): Promise<Fixture | null>;
  history(teamExternalId: string, beforeDate: string): Promise<Fixture[]>;
  h2h(homeExternalId: string, awayExternalId: string, beforeDate: string): Promise<Fixture[]>;
  /** Optional batch with inline statistics, avoiding repeated source parsing and database writes. */
  matchHistory?(
    home: string,
    away: string,
    cutoff: string,
  ): Promise<{
    homeHistory: Fixture[];
    awayHistory: Fixture[];
    h2h: Fixture[];
  }>;
  previewRange?(date: string, days: number): Promise<MatchData[]>;
  previewData?(date: string): Promise<MatchData[]>;
  statistics(fixture: Fixture): Promise<{ home: TeamMetrics; away: TeamMetrics } | null>;
  events(fixtureExternalId: string): Promise<MatchEvent[]>;
}
