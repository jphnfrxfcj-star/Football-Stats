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
        quotes: quotes.filter((q) => q.market === market),
      });
    }
  }
  const { quotes: _, ...metadata } = odds;
  return { window, fixtures, selections, odds: metadata };
}
// Quotes are indicative: unknown or stale timestamps remain explicitly visible in the UI.
export function suggestCombinations(
  selections: PerfectSelection[],
  bookmaker: string,
  now = Date.now(),
  maxLegs = 6,
  options: { limit?: number; diverse?: boolean; minOdd?: number; maxOdd?: number } = {},
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
  const legs: ComboLeg[] = selections.flatMap((selection) => {
    if (Date.parse(selection.fixture.kickoff) <= now) return [];
    const quote = selection.quotes
      .filter(
        (q) =>
          q.bookmaker === bookmaker &&
          Number.isFinite(q.decimal) &&
          q.decimal >= 1.1 &&
          q.decimal <= maxOdd,
      )
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))[0];
    return quote ? [{ selection, quote }] : [];
  });
  const found: Combination[] = [];
  let visits = 0;
  function visit(start: number, picked: ComboLeg[], decimal: number) {
    if (++visits > 50000) return;
    if (picked.length >= 2 && decimal >= minOdd && decimal <= maxOdd) {
      found.push({ bookmaker, legs: picked, decimal });
      return;
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
      Math.abs(a.decimal - target) - Math.abs(b.decimal - target) || a.legs.length - b.legs.length,
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
    for (const combo of remaining) {
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
