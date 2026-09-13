import { before, type Fixture, type MatchData } from '../domain/models';
import { frequency, occurrence, type Market } from './engine';
export const pricedMarkets = {
  home: 'Thuis wint',
  draw: 'Gelijkspel',
  away: 'Uit wint',
  over05: 'Over 0.5 goals',
  over15: 'Over 1.5 goals',
  over25: 'Over 2.5 goals',
  over35: 'Over 3.5 goals',
  under25: 'Under 2.5 goals',
  btts: 'Beide teams scoren',
};
export type PricedMarket = keyof typeof pricedMarkets;
export function marketOutcome(
  f: Fixture,
  team: string,
  side: 'home' | 'away',
  market: PricedMarket,
) {
  if (!['home', 'draw', 'away'].includes(market)) return occurrence(f, team, market as Market);
  if (
    f.status !== 'finished' ||
    f.homeGoals === null ||
    f.awayGoals === null ||
    (f.home.id !== team && f.away.id !== team)
  )
    return null;
  const own = f.home.id === team ? f.homeGoals : f.awayGoals,
    other = f.home.id === team ? f.awayGoals : f.homeGoals;
  return market === 'draw' ? own === other : market === side ? own > other : own < other;
}
export function selectionEvidence(
  data: MatchData,
  markets: PricedMarket[],
  window: number,
  now = Date.now(),
) {
  const cutoff = new Date(Math.min(now, Date.parse(data.fixture.kickoff))).toISOString();
  return (['home', 'away'] as const).map((side) => {
    const team = data.fixture[side];
    const rows = before(side === 'home' ? data.homeHistory : data.awayHistory, cutoff)
      .filter((f) => f.home.id === team.id || f.away.id === team.id)
      .slice(0, window);
    const values = rows.map((f) => {
      const outcomes = markets.map((m) => marketOutcome(f, team.id, side, m));
      return !outcomes.length || outcomes.includes(null) ? null : outcomes.every(Boolean);
    });
    return { team, rows, values, frequency: frequency(values) };
  });
}
export function priceAssessment(decimal: number, probability: number | null) {
  if (!Number.isFinite(decimal) || decimal <= 1 || decimal > 1000) return null;
  const p =
    probability !== null && Number.isFinite(probability) && probability > 0 && probability < 100
      ? probability
      : null;
  return { implied: 100 / decimal, model: p, gap: p === null ? null : p - 100 / decimal };
}
