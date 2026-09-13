import type { Fixture } from '../domain/models';
import { occurrence, type Market } from './engine';
import { marketOutcome, pricedMarkets, type PricedMarket } from './bet-evidence';
export function isUpcoming(f: Fixture, now = Date.now()) {
  return f.status === 'scheduled' && f.kickoffKnown !== false && Date.parse(f.kickoff) > now;
}
export function matchRecap(f: Fixture) {
  if (f.status !== 'finished') return [];
  const rows: { market: string; label: string; result: boolean | null }[] = (
    Object.entries(pricedMarkets) as [PricedMarket, string][]
  ).map(([market, label]) => ({
    market,
    label,
    result: marketOutcome(f, f.home.id, 'home', market),
  }));
  for (const [market, label] of [
    ['firstHalf05', '1e helft over 0.5'],
    ['firstHalf15', '1e helft over 1.5'],
  ] as [Market, string][])
    rows.push({ market, label, result: occurrence(f, f.home.id, market) });
  return rows;
}
export function dayRecap(fixtures: Fixture[]) {
  const finished = fixtures.filter((f) => f.status === 'finished');
  const scored = finished.filter((f) => f.homeGoals !== null && f.awayGoals !== null);
  return {
    finished: finished.length,
    scored: scored.length,
    goals: scored.reduce((n, f) => n + f.homeGoals! + f.awayGoals!, 0),
    markets: (['over25', 'btts'] as const).map((m) => {
      const known = finished.map((f) => occurrence(f, f.home.id, m)).filter((v) => v !== null);
      return { market: m, successes: known.filter(Boolean).length, total: known.length };
    }),
  };
}
