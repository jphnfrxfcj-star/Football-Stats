export interface ProviderRef {
  provider: string;
  externalId: string;
}
export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string | null;
  color: string;
  refs: ProviderRef[];
}
export interface League {
  id: string;
  name: string;
  country: string;
  logo: string | null;
  refs: ProviderRef[];
}
export type Metric =
  | 'shots'
  | 'shotsOnTarget'
  | 'possession'
  | 'corners'
  | 'fouls'
  | 'yellowCards'
  | 'redCards'
  | 'bigChances'
  | 'xg';
export type TeamMetrics = Record<Metric, number | null>;
export interface Fixture {
  id: string;
  refs: ProviderRef[];
  league: League;
  home: Team;
  away: Team;
  kickoff: string;
  venue: string | null;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  homeGoals: number | null;
  awayGoals: number | null;
  halfHomeGoals: number | null;
  halfAwayGoals: number | null;
  statistics: { home: TeamMetrics; away: TeamMetrics } | null;
}
export interface MatchEvent {
  minute: number;
  extra: number | null;
  teamId: string;
  player: string | null;
  type: string;
  detail: string;
}
export interface MatchData {
  fixture: Fixture;
  homeHistory: Fixture[];
  awayHistory: Fixture[];
  h2h: Fixture[];
  source: 'demo' | 'live';
  updatedAt: string;
  warnings: string[];
}
export const emptyMetrics = (): TeamMetrics => ({
  shots: null,
  shotsOnTarget: null,
  possession: null,
  corners: null,
  fouls: null,
  yellowCards: null,
  redCards: null,
  bigChances: null,
  xg: null,
});
export const isComplete = (f: Fixture) =>
  f.status === 'finished' && f.homeGoals !== null && f.awayGoals !== null;
export function before(fixtures: Fixture[], kickoff: string): Fixture[] {
  return [
    ...new Map(
      fixtures
        .filter((f) => f.status === 'finished' && Date.parse(f.kickoff) < Date.parse(kickoff))
        .map((f) => [f.id, f]),
    ).values(),
  ].sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
}
