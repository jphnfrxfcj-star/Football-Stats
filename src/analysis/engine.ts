import { before, type Fixture, type MatchData, type Metric } from '../domain/models';
import { analysisWeights as weights, h2hWeight } from './config';
export const marketLabels = {
  over05: 'Over 0.5',
  over15: 'Over 1.5',
  over25: 'Over 2.5',
  over35: 'Over 3.5',
  under25: 'Under 2.5',
  btts: 'Beide teams scoren',
  team05: 'Team scoort',
  team15: 'Team over 1.5',
  firstHalf05: '1e helft over 0.5',
  firstHalf15: '1e helft over 1.5',
};
export type Market = keyof typeof marketLabels;
export interface Frequency {
  successes: number;
  total: number;
  percentage: number | null;
}
export function occurrence(f: Fixture, teamId: string, market: Market): boolean | null {
  if (f.status !== 'finished' || (f.home.id !== teamId && f.away.id !== teamId)) return null;
  if (market === 'firstHalf05' || market === 'firstHalf15')
    return f.halfHomeGoals === null || f.halfAwayGoals === null
      ? null
      : f.halfHomeGoals + f.halfAwayGoals > (market === 'firstHalf05' ? 0.5 : 1.5);
  const own = f.home.id === teamId ? f.homeGoals : f.awayGoals;
  if (market === 'team05' || market === 'team15')
    return own === null ? null : own > (market === 'team05' ? 0.5 : 1.5);
  if (f.homeGoals === null || f.awayGoals === null) return null;
  const total = f.homeGoals + f.awayGoals;
  switch (market) {
    case 'over05':
      return total > 0.5;
    case 'over15':
      return total > 1.5;
    case 'over25':
      return total > 2.5;
    case 'over35':
      return total > 3.5;
    case 'under25':
      return total < 2.5;
    case 'btts':
      return f.homeGoals > 0 && f.awayGoals > 0;
  }
}
export function frequency(values: (boolean | null)[]): Frequency {
  const valid = values.filter((v): v is boolean => v !== null);
  const successes = valid.filter(Boolean).length;
  return {
    successes,
    total: valid.length,
    percentage: valid.length ? (successes / valid.length) * 100 : null,
  };
}
export function summarize(
  fixtures: Fixture[],
  teamId: string,
  limit: number,
  venue?: 'home' | 'away',
) {
  const selected = [...fixtures]
    .filter(
      (f) =>
        (f.home.id === teamId || f.away.id === teamId) &&
        f.status === 'finished' &&
        (!venue || f[venue].id === teamId),
    )
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
    .slice(0, limit);
  const valid = selected.filter((f) => f.homeGoals !== null && f.awayGoals !== null);
  const results = valid.map((f) => {
    const gf = (f.home.id === teamId ? f.homeGoals : f.awayGoals)!;
    const ga = (f.home.id === teamId ? f.awayGoals : f.homeGoals)!;
    return { gf, ga, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L' };
  });
  return {
    available: valid.length,
    requested: limit,
    fixtures: selected,
    results: results.map((r) => r.result),
    wins: results.filter((r) => r.result === 'W').length,
    draws: results.filter((r) => r.result === 'D').length,
    losses: results.filter((r) => r.result === 'L').length,
    goalsFor: valid.length ? results.reduce((s, r) => s + r.gf, 0) : null,
    goalsAgainst: valid.length ? results.reduce((s, r) => s + r.ga, 0) : null,
    goalsPerMatch: valid.length ? results.reduce((s, r) => s + r.gf, 0) / valid.length : null,
    averageTotalGoals: valid.length
      ? results.reduce((s, r) => s + r.gf + r.ga, 0) / valid.length
      : null,
    cleanSheets: frequency(results.map((r) => r.ga === 0)),
    scored: frequency(results.map((r) => r.gf > 0)),
    failedToScore: frequency(results.map((r) => r.gf === 0)),
    markets: Object.fromEntries(
      (Object.keys(marketLabels) as Market[]).map((m) => [
        m,
        frequency(selected.map((f) => occurrence(f, teamId, m))),
      ]),
    ) as Record<Market, Frequency>,
  };
}
export function metricAverage(fixtures: Fixture[], teamId: string, metric: Metric) {
  const values = fixtures
    .filter((f) => f.home.id === teamId || f.away.id === teamId)
    .map((f) => f.statistics?.[f.home.id === teamId ? 'home' : 'away'][metric])
    .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  return {
    value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    total: values.length,
  };
}
export function weightedMarket(data: MatchData, market: Market) {
  const f = data.fixture;
  const entries: { value: boolean; weight: number; id: string }[] = [];
  const add = (fixtures: Fixture[], team: string, venue: 'home' | 'away') => {
    before(fixtures, f.kickoff)
      .filter((item) => item.home.id === team || item.away.id === team)
      .slice(0, 20)
      .forEach((item, i) => {
        const value = occurrence(item, team, market);
        // Disjoint recency bands; venue is a multiplier, never a duplicated observation.
        if (value !== null)
          entries.push({
            value,
            id: item.id,
            weight:
              (i < 5 ? weights.recent5 : i < 10 ? weights.recent10 : weights.recent20) *
              (item[venue].id === team ? weights.homeAway : 1),
          });
      });
  };
  add(data.homeHistory, f.home.id, 'home');
  add(data.awayHistory, f.away.id, 'away');
  const seen = new Set(entries.map((e) => e.id));
  before(data.h2h, f.kickoff)
    .slice(0, 10)
    .forEach((item) => {
      const value = occurrence(item, f.home.id, market);
      if (value !== null && !seen.has(item.id))
        entries.push({
          value,
          id: item.id,
          weight: h2hWeight(f.kickoff, item.kickoff),
        });
    });
  // A shared fixture can occur in both histories; retain only one observation.
  const byId = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    // A shared game keeps its strongest relevant weight, independent of team order.
    if (entry.weight > (byId.get(entry.id)?.weight ?? -1)) byId.set(entry.id, entry);
  }
  const unique = [...byId.values()];
  const totalWeight = unique.reduce((s, e) => s + e.weight, 0);
  const successWeight = unique.reduce((s, e) => s + (e.value ? e.weight : 0), 0);
  return {
    percentage: totalWeight ? (successWeight / totalWeight) * 100 : null,
    probability: totalWeight
      ? ((successWeight + weights.priorSuccesses) /
          (totalWeight + weights.priorSuccesses + weights.priorFailures)) *
        100
      : null,
    sampleSize: unique.length,
    totalWeight,
  };
}
export function analyze(data: MatchData) {
  const home = before(data.homeHistory, data.fixture.kickoff),
    away = before(data.awayHistory, data.fixture.kickoff),
    h2h = before(data.h2h, data.fixture.kickoff);
  const windows = (history: Fixture[], id: string, venue?: 'home' | 'away') =>
    [5, 10, 20].map((n) => summarize(history, id, n, venue));
  const combined = Object.fromEntries(
    (Object.keys(marketLabels) as Market[]).map((m) => [m, weightedMarket(data, m)]),
  ) as Record<Market, ReturnType<typeof weightedMarket>>;
  const trends: { text: string; percentage: number; sampleSize: number; score: number }[] = [];
  for (const [history, team, venue] of [
    [home, data.fixture.home, 'home'],
    [away, data.fixture.away, 'away'],
  ] as const) {
    for (const split of [false, true]) {
      const s = summarize(history, team.id, 10, split ? venue : undefined);
      const recency = s.fixtures.length
        ? s.fixtures.reduce(
            (sum, item) =>
              sum +
              Math.exp(
                -(Date.parse(data.fixture.kickoff) - Date.parse(item.kickoff)) / (365 * 86400000),
              ),
            0,
          ) / s.fixtures.length
        : 0;
      for (const market of ['team05', 'over15', 'over25', 'btts'] as Market[]) {
        const r = s.markets[market];
        if (r.total >= 5 && r.percentage !== null && r.percentage >= 65)
          trends.push({
            text: `${team.name}: ${marketLabels[market]} in ${r.successes} van de laatste ${r.total} ${split ? (venue === 'home' ? 'thuiswedstrijden' : 'uitwedstrijden') : 'wedstrijden'}.`,
            percentage: r.percentage,
            sampleSize: r.total,
            score: r.percentage * Math.sqrt(r.total) * (split ? 1.1 : 1) * recency,
          });
      }
      if (s.cleanSheets.total >= 5 && s.cleanSheets.successes <= 2)
        trends.push({
          text: `${team.name}: slechts ${s.cleanSheets.successes} clean sheets in ${s.available} ${split ? (venue === 'home' ? 'thuiswedstrijden' : 'uitwedstrijden') : 'wedstrijden'}.`,
          percentage: 100 - (s.cleanSheets.percentage ?? 0),
          sampleSize: s.available,
          score:
            (100 - (s.cleanSheets.percentage ?? 0)) *
            Math.sqrt(s.available) *
            (split ? 1.1 : 1) *
            recency,
        });
    }
  }
  const hs = summarize(h2h, data.fixture.home.id, 10);
  if (hs.markets.over25.total >= 5 && (hs.markets.over25.percentage ?? 0) >= 65)
    trends.push({
      text: `${hs.markets.over25.successes} van de laatste ${hs.available} onderlinge duels hadden meer dan 2.5 goals.`,
      percentage: hs.markets.over25.percentage!,
      sampleSize: hs.available,
      score: hs.markets.over25.percentage! * Math.sqrt(hs.available) * 0.35,
    });
  return {
    home: windows(home, data.fixture.home.id),
    away: windows(away, data.fixture.away.id),
    homeSplit: windows(home, data.fixture.home.id, 'home'),
    awaySplit: windows(away, data.fixture.away.id, 'away'),
    h2h: [5, 10].map((n) => summarize(h2h, data.fixture.home.id, n)),
    combined,
    trends: trends.sort((a, b) => b.score - a.score).slice(0, 6),
    version: weights.version,
  };
}
export type Analysis = ReturnType<typeof analyze>;
