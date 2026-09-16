import { before, type Fixture, type MatchData } from '../src/domain/models';
import { isUpcoming } from '../src/analysis/recap';
/** Goal-market evidence needs scores and identities, not duplicated full statistics/provenance. */
export interface MarketHistory {
  fixtures: Fixture[];
  matches: { fixture: number; home: number[]; away: number[]; h2h: number[] }[];
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
        const cutoff = new Date(Math.min(now, Date.parse(d.fixture.kickoff))).toISOString();
        const history = (rows: Fixture[], team: string, side: 'home' | 'away') => {
          const prior = before(rows, cutoff).filter(
            (f) => f.home.id === team || f.away.id === team,
          );
          return [
            ...new Map(
              [...prior.slice(0, 20), ...prior.filter((f) => f[side].id === team).slice(0, 10)].map(
                (f) => [f.id, f],
              ),
            ).values(),
          ].map(index);
        };
        return {
          fixture: index(d.fixture),
          home: history(d.homeHistory, d.fixture.home.id, 'home'),
          away: history(d.awayHistory, d.fixture.away.id, 'away'),
          h2h: before(d.h2h, cutoff)
            .filter(
              (f) =>
                [f.home.id, f.away.id].includes(d.fixture.home.id) &&
                [f.home.id, f.away.id].includes(d.fixture.away.id),
            )
            .slice(0, 10)
            .map(index),
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
    h2h: m.h2h.map((i) => packed.fixtures[i]),
    source: 'live',
    updatedAt: new Date().toISOString(),
    warnings: [],
  }));
}
