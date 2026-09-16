import { analysisWeights as weights } from './config';
import { before, type MatchData, type Fixture } from '../domain/models';
import type { OddsQuote } from '../domain/spotlight';
import { frequency, occurrence, weightedMarket, type Market, type Frequency } from './engine';

/** Screening policy, not fitted parameters or a calibrated confidence interval. */
export const comboAssessmentPolicy = {
  version: '1.0.0',
  history: 20,
  venueMinimum: 5,
  marginPoints: 5,
  priceMaxAgeMs: 15 * 60000,
} as const;
export interface ComboModelEvidence {
  version: string;
  asOf: string;
  weightedProbability: number | null;
  goalsProbability: number | null;
  homeObserved: number;
  awayObserved: number;
  homeLast5: Frequency;
  awayLast5: Frequency;
  homePrevious5: Frequency;
  awayPrevious5: Frequency;
  h2hResults: { date: string; hit: boolean | null }[];
  homeRecent: Frequency;
  awayRecent: Frequency;
  homeVenue: Frequency;
  awayVenue: Frequency;
  h2h: Frequency;
  uniqueMatches: number;
}

/** Same attack/defence construction as the 1X2 model; no fitted Dixon–Coles claim. */
export function goalMarketProbability(data: MatchData, market: Market): number | null {
  if (market === 'team05' || market === 'team15') return null;
  const half = market.startsWith('firstHalf');
  function rate(side: 'home' | 'away', conceded: boolean) {
    const team = data.fixture[side].id;
    const rows = before(side === 'home' ? data.homeHistory : data.awayHistory, data.fixture.kickoff)
      .filter((f) => f.home.id === team || f.away.id === team)
      .slice(0, 20);
    let sum = 0,
      total = 0;
    rows.forEach((f, i) => {
      const home = f.home.id === team;
      const hg = half ? f.halfHomeGoals : f.homeGoals;
      const ag = half ? f.halfAwayGoals : f.awayGoals;
      if (hg === null || ag === null) return;
      const goals = conceded ? (home ? ag : hg) : home ? hg : ag;
      const weight =
        (i < 5 ? weights.recent5 : i < 10 ? weights.recent10 : weights.recent20) *
        (f[side].id === team ? weights.homeAway : 1);
      sum += goals * weight;
      total += weight;
    });
    return total ? sum / total : null;
  }
  const rates = [rate('home', false), rate('home', true), rate('away', false), rate('away', true)];
  if (rates.some((r) => r === null)) return null;
  const home = Math.sqrt(rates[0]! * rates[3]!);
  const away = Math.sqrt(rates[2]! * rates[1]!);
  if (market === 'btts') return (1 - Math.exp(-home)) * (1 - Math.exp(-away)) * 100;
  const thresholds: Partial<Record<Market, number>> = {
    over05: 0,
    over15: 1,
    over25: 2,
    over35: 3,
    under25: 2,
    firstHalf05: 0,
    firstHalf15: 1,
  };
  const threshold = thresholds[market];
  if (threshold === undefined) return null;
  const lambda = home + away;
  let term = Math.exp(-lambda),
    cdf = term;
  for (let k = 1; k <= threshold; k++) {
    term *= lambda / k;
    cdf += term;
  }
  return Math.max(0, Math.min(100, (market === 'under25' ? cdf : 1 - cdf) * 100));
}

export function comboModelEvidence(
  data: MatchData,
  market: Market,
  now = Date.now(),
): ComboModelEvidence {
  const cutoff = new Date(Math.min(now, Date.parse(data.fixture.kickoff))).toISOString();
  const includes = (f: Fixture, id: string) => f.home.id === id || f.away.id === id;
  const filtered: MatchData = {
    ...data,
    homeHistory: before(data.homeHistory, cutoff).filter((f) => includes(f, data.fixture.home.id)),
    awayHistory: before(data.awayHistory, cutoff).filter((f) => includes(f, data.fixture.away.id)),
    h2h: before(data.h2h, cutoff).filter(
      (f) => includes(f, data.fixture.home.id) && includes(f, data.fixture.away.id),
    ),
  };
  const summarize = (rows: Fixture[], id: string) =>
    frequency(rows.map((f) => occurrence(f, id, market)));
  const home = data.fixture.home.id,
    away = data.fixture.away.id;
  const weighted = weightedMarket(filtered, market);
  return {
    version: comboAssessmentPolicy.version,
    asOf: cutoff,
    weightedProbability: weighted.probability,
    goalsProbability: goalMarketProbability(filtered, market),
    homeObserved: summarize(filtered.homeHistory.slice(0, 20), home).total,
    awayObserved: summarize(filtered.awayHistory.slice(0, 20), away).total,
    homeLast5: summarize(filtered.homeHistory.slice(0, 5), home),
    awayLast5: summarize(filtered.awayHistory.slice(0, 5), away),
    homePrevious5: summarize(filtered.homeHistory.slice(5, 10), home),
    awayPrevious5: summarize(filtered.awayHistory.slice(5, 10), away),
    h2hResults: filtered.h2h
      .slice(0, 10)
      .map((f) => ({ date: f.kickoff, hit: occurrence(f, home, market) })),
    homeRecent: summarize(filtered.homeHistory.slice(0, 10), home),
    awayRecent: summarize(filtered.awayHistory.slice(0, 10), away),
    homeVenue: summarize(filtered.homeHistory.filter((f) => f.home.id === home).slice(0, 10), home),
    awayVenue: summarize(filtered.awayHistory.filter((f) => f.away.id === away).slice(0, 10), away),
    h2h: summarize(filtered.h2h.slice(0, 10), home),
    uniqueMatches: weighted.sampleSize,
  };
}
export type ComboPriceStatus =
  'passes' | 'insufficient-history' | 'unverified-price' | 'insufficient-margin';
export function assessComboPrice(
  selection: { model?: ComboModelEvidence; oddsKind?: 'feed' | 'snapshot' },
  quote: OddsQuote,
  now = Date.now(),
) {
  const model = selection.model;
  const values = [model?.weightedProbability, model?.goalsProbability];
  const probability = values.every(
    (p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0 && p < 100,
  )
    ? Math.min(...(values as number[]))
    : null;
  const implied = Number.isFinite(quote.decimal) && quote.decimal > 1 ? 100 / quote.decimal : null;
  const margin = probability !== null && implied !== null ? probability - implied : null;
  const timestamp = quote.observedAt ?? quote.updatedAt;
  const age = timestamp == null ? NaN : now - Date.parse(timestamp);
  let status: ComboPriceStatus;
  if (
    !model ||
    model.version !== comboAssessmentPolicy.version ||
    probability === null ||
    model.homeObserved < comboAssessmentPolicy.history ||
    model.awayObserved < comboAssessmentPolicy.history ||
    model.homeVenue.total < comboAssessmentPolicy.venueMinimum ||
    model.awayVenue.total < comboAssessmentPolicy.venueMinimum
  )
    status = 'insufficient-history';
  else if (
    selection.oddsKind !== 'feed' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > comboAssessmentPolicy.priceMaxAgeMs
  )
    status = 'unverified-price';
  else if (margin === null || margin < comboAssessmentPolicy.marginPoints)
    status = 'insufficient-margin';
  else status = 'passes';
  return { status, probability, implied, margin };
}
