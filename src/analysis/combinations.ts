import { comboModelEvidence, assessComboPrice, type ComboModelEvidence } from './combo-assessment';
import { before, type Fixture, type MatchData } from '../domain/models';
import { canonicalClubName } from '../domain/club-names';
import type { OddsQuote, OddsSnapshot } from '../domain/spotlight';
import { occurrence, marketLabels, type Market } from './engine';

export const comboRates = [50, 60, 70, 80, 90, 100] as const;
export const comboMarkets: Market[] = [
  'over05',
  'over15',
  'over25',
  'over35',
  'under25',
  'btts',
  'firstHalf05',
  'firstHalf15',
];
export interface PerfectSelection {
  id: string;
  fixture: Fixture;
  market: Market;
  label: string;
  homeEvidence: Fixture[];
  awayEvidence: Fixture[];
  quotes: OddsQuote[];
  model?: ComboModelEvidence;
  oddsKind?: OddsSnapshot['kind'];
}
export interface MarketsReport {
  window: number;
  fixtures: { fixture: Fixture; quotes: OddsQuote[] }[];
  selections: PerfectSelection[];
  odds: Omit<OddsSnapshot, 'quotes'>;
}
export interface ComboLeg {
  selection: PerfectSelection;
  quote: OddsQuote;
}
export interface Combination {
  evaluationMode?: 'history' | 'review' | 'strict';
  priceChecked?: boolean;
  bookmaker: string;
  legs: ComboLeg[];
  decimal: number;
}
export function fixtureQuotes(f: Fixture, odds: OddsSnapshot): OddsQuote[] {
  const home = canonicalClubName(f.home.name),
    away = canonicalClubName(f.away.name);
  if (!home || !away) return [];
  return odds.quotes.filter(
    (q) =>
      q.home === home &&
      q.away === away &&
      q.date === (f.sourceDate ?? f.kickoff.slice(0, 10)) &&
      Number.isFinite(q.decimal) &&
      q.decimal > 1 &&
      (q.kickoff === null || Math.abs(Date.parse(q.kickoff) - Date.parse(f.kickoff)) <= 60000),
  );
}
export function buildMarkets(
  matches: MatchData[],
  odds: OddsSnapshot,
  window = 5,
  now = Date.now(),
  minimumRate = 100,
): MarketsReport {
  if (!comboRates.some((rate) => rate === minimumRate))
    throw new Error('Ongeldige historische drempel');
  if (![5, 10, 20].includes(window)) throw new Error('Ongeldig analysevenster');
  const fixtures: MarketsReport['fixtures'] = [],
    selections: PerfectSelection[] = [];
  for (const data of matches) {
    const f = data.fixture;
    if (f.status !== 'scheduled' || f.kickoffKnown === false || !(Date.parse(f.kickoff) > now))
      continue;
    const quotes = fixtureQuotes(f, odds);
    fixtures.push({ fixture: f, quotes });
    const history = (rows: Fixture[], team: string) =>
      before(rows, new Date(Math.min(now, Date.parse(f.kickoff))).toISOString())
        .filter((row) => row.home.id === team || row.away.id === team)
        .slice(0, window);
    const homeEvidence = history(data.homeHistory, f.home.id),
      awayEvidence = history(data.awayHistory, f.away.id);
    if (homeEvidence.length !== window || awayEvidence.length !== window) continue;
    for (const market of comboMarkets) {
      const qualifies = (rows: Fixture[], team: string) => {
        const values = rows.map((row) => occurrence(row, team, market));
        return (
          values.every((v) => v !== null) &&
          values.filter((v) => v === true).length * 100 >= minimumRate * window
        );
      };
      if (!qualifies(homeEvidence, f.home.id) || !qualifies(awayEvidence, f.away.id)) continue;
      selections.push({
        id: `${f.id}:${market}`,
        fixture: f,
        market,
        label: marketLabels[market],
        homeEvidence,
        awayEvidence,
        model: comboModelEvidence(data, market, now),
        oddsKind: odds.kind,
        quotes: quotes.filter((q) => q.market === market),
      });
    }
  }
  const { quotes: _, ...metadata } = odds;
  return { window, fixtures, selections, odds: metadata };
}
/** Pick the newest applicable price first; never cherry-pick an older price that passes a filter. */
export function comboCandidates(
  selections: PerfectSelection[],
  bookmaker: string,
  now: number,
  maxOdd: number,
) {
  const time = (q: OddsQuote) => {
    const timestamp = Date.parse(q.observedAt ?? q.updatedAt ?? '');
    return Number.isFinite(timestamp) ? timestamp : -Infinity;
  };
  return selections.flatMap((selection) => {
    if (
      selection.fixture.status !== 'scheduled' ||
      selection.fixture.kickoffKnown === false ||
      !(Date.parse(selection.fixture.kickoff) > now)
    )
      return [];
    const quote = selection.quotes
      .filter(
        (q) =>
          q.bookmaker === bookmaker &&
          q.market === selection.market &&
          Number.isFinite(q.decimal) &&
          q.decimal > 1,
      )
      .sort((a, b) => time(b) - time(a))[0];
    if (!quote || quote.decimal < 1.1 || quote.decimal > maxOdd) return [];
    return [{ selection, quote, assessment: assessComboPrice(selection, quote, now) }];
  });
}
export function comboEvidenceOrder(legs: ComboLeg[], now: number) {
  const tiers = { 'both-above': 0, disagree: 1, 'both-below': 2, unavailable: 3 };
  const assessments = legs.map((l) => assessComboPrice(l.selection, l.quote, now));
  const ranks = assessments.map((a) => tiers[a.comparison]);
  return {
    worst: Math.max(...ranks),
    average: ranks.reduce((s, v) => s + v, 0) / ranks.length,
    margin: Math.min(...assessments.map((a) => a.margin ?? -Infinity)),
  };
}
function compareEvidence(a: ComboLeg[], b: ComboLeg[], now: number) {
  const x = comboEvidenceOrder(a, now),
    y = comboEvidenceOrder(b, now);
  return x.worst - y.worst || x.average - y.average || y.margin - x.margin || 0;
}
// Quotes are indicative: unknown or stale timestamps remain explicitly visible in the UI.
export function suggestCombinations(
  selections: PerfectSelection[],
  bookmaker: string,
  now = Date.now(),
  maxLegs = 6,
  options: {
    limit?: number;
    diverse?: boolean;
    minOdd?: number;
    maxOdd?: number;
    requirePriceCheck?: boolean;
    rankByAssessment?: boolean;
  } = {},
): Combination[] {
  const minOdd = options.minOdd ?? 2,
    maxOdd = options.maxOdd ?? 3;
  if (
    !Number.isFinite(minOdd) ||
    !Number.isFinite(maxOdd) ||
    minOdd < 2 ||
    maxOdd > 20 ||
    minOdd > maxOdd
  )
    return [];
  const target = (minOdd + maxOdd) / 2;
  const legs: ComboLeg[] = comboCandidates(selections, bookmaker, now, maxOdd).filter(
    (candidate) => !options.requirePriceCheck || candidate.assessment.status === 'passes',
  );
  if (options.rankByAssessment)
    legs.sort(
      (a, b) => compareEvidence([a], [b], now) || a.selection.id.localeCompare(b.selection.id),
    );
  const found: Combination[] = [];
  // A full search can retain 50,000 paths. Compute each path's assessment once.
  const evidenceCache = new WeakMap<ComboLeg[], ReturnType<typeof comboEvidenceOrder>>();
  const evidence = (path: ComboLeg[]) => {
    let value = evidenceCache.get(path);
    if (!value) {
      value = comboEvidenceOrder(path, now);
      evidenceCache.set(path, value);
    }
    return value;
  };
  const comparePaths = (a: ComboLeg[], b: ComboLeg[]) => {
    const x = evidence(a),
      y = evidence(b);
    return x.worst - y.worst || x.average - y.average || y.margin - x.margin || 0;
  };
  let visits = 0;
  function visit(start: number, picked: ComboLeg[], decimal: number) {
    if (++visits > 50000) return;
    if (picked.length >= 2 && decimal >= minOdd && decimal <= maxOdd) {
      found.push({
        bookmaker,
        legs: picked,
        decimal,
        priceChecked: options.requirePriceCheck ?? false,
        evaluationMode: options.requirePriceCheck
          ? 'strict'
          : options.rankByAssessment
            ? 'review'
            : 'history',
      });
    }
    if (picked.length === Math.max(2, Math.min(8, maxLegs))) return;
    for (let i = start; i < legs.length && visits < 50000; i++) {
      const leg = legs[i],
        next = decimal * leg.quote.decimal;
      const fixture = leg.selection.fixture;
      if (
        next > maxOdd ||
        picked.some(
          ({ selection: { fixture: other } }) =>
            other.id === fixture.id ||
            [other.home.id, other.away.id].some(
              (id) => id === fixture.home.id || id === fixture.away.id,
            ),
        )
      )
        continue;
      visit(i + 1, [...picked, leg], next);
    }
  }
  visit(0, [], 1);
  const ranked = found.sort(
    (a, b) =>
      (options.rankByAssessment ? comparePaths(a.legs, b.legs) : 0) ||
      Math.abs(a.decimal - target) - Math.abs(b.decimal - target) ||
      a.legs.length - b.legs.length,
  );
  const limit = Math.max(1, Math.min(12, options.limit ?? 3));
  if (!options.diverse) return ranked.slice(0, limit);
  const selected: Combination[] = [];
  const used = new Map<string, number>();
  const usedMarkets = new Map<string, number>();
  const remaining = new Set(ranked);
  while (selected.length < limit && remaining.size) {
    let best: Combination | undefined;
    let bestScore = -Infinity;
    const bestTier = options.rankByAssessment
      ? [...remaining].reduce((best, c) => Math.min(best, evidence(c.legs).worst), Infinity)
      : null;
    for (const combo of remaining) {
      if (bestTier !== null && evidence(combo.legs).worst !== bestTier) continue;
      const markets = new Set(combo.legs.map((l) => l.selection.market));
      const repetition =
        combo.legs.reduce((n, l) => n + (used.get(l.selection.id) ?? 0), 0) / combo.legs.length;
      const marketRepetition =
        [...markets].reduce((n, m) => n + (usedMarkets.get(m) ?? 0), 0) / markets.size;
      const score =
        markets.size / combo.legs.length -
        repetition * 2 -
        marketRepetition * 0.5 -
        Math.abs(combo.decimal - target) * 0.1;
      if (score > bestScore) {
        best = combo;
        bestScore = score;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.delete(best);
    best.legs.forEach((l) => used.set(l.selection.id, (used.get(l.selection.id) ?? 0) + 1));
    new Set(best.legs.map((l) => l.selection.market)).forEach((m) =>
      usedMarkets.set(m, (usedMarkets.get(m) ?? 0) + 1),
    );
  }
  return selected;
}
