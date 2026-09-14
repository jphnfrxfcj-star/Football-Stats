import { before, type Fixture, type MatchData } from '../src/domain/models';
import { isUpcoming } from '../src/analysis/recap';
/** Goal-market evidence needs scores and identities, not duplicated full statistics/provenance. */
export interface MarketHistory {
  fixtures: Fixture[];
  matches: { fixture: number; home: number[]; away: number[] }[];
}
export function packMarketHistory(data: MatchData[], now = Date.now()): MarketHistory {
  const fixtures: Fixture[] = [],
    indices = new Map<string, number>();
  function index(f: Fixture) {
    const existing = indices.get(f.id);
    if (existing !== undefined) return existing;
    const i = fixtures.length;
    fixtures.push({ ...f, statistics: null, provenance: undefined });
    indices.set(f.id, i);
    return i;
  }
  return {
    matches: data
      .filter((d) => isUpcoming(d.fixture, now))
      .map((d) => {
        const history = (rows: Fixture[], team: string) =>
          before(rows, new Date(Math.min(now, Date.parse(d.fixture.kickoff))).toISOString())
            .filter((f) => f.home.id === team || f.away.id === team)
            .slice(0, 20)
            .map(index);
        return {
          fixture: index(d.fixture),
          home: history(d.homeHistory, d.fixture.home.id),
          away: history(d.awayHistory, d.fixture.away.id),
        };
      }),
    fixtures,
  };
}
export function unpackMarketHistory(packed: MarketHistory): MatchData[] {
  return packed.matches.map((m) => ({
    fixture: packed.fixtures[m.fixture],
    homeHistory: m.home.map((i) => packed.fixtures[i]),
    awayHistory: m.away.map((i) => packed.fixtures[i]),
    h2h: [],
    source: 'live',
    updatedAt: new Date().toISOString(),
    warnings: [],
  }));
}
