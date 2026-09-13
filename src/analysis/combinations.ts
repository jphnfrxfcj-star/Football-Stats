import { before, type Fixture, type MatchData } from '../domain/models';
import { canonicalClubName } from '../domain/club-names';
import type { OddsQuote, OddsSnapshot } from '../domain/spotlight';
import { occurrence, marketLabels, type Market } from './engine';

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
  if (![80, 90, 100].includes(minimumRate)) throw new Error('Ongeldige historische drempel');
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
): Combination[] {
  const legs: ComboLeg[] = selections.flatMap((selection) => {
    if (Date.parse(selection.fixture.kickoff) <= now) return [];
    const quote = selection.quotes
      .filter(
        (q) =>
          q.bookmaker === bookmaker &&
          Number.isFinite(q.decimal) &&
          q.decimal > 1 &&
          q.decimal <= 3,
      )
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))[0];
    return quote ? [{ selection, quote }] : [];
  });
  const found: Combination[] = [];
  let visits = 0;
  function visit(start: number, picked: ComboLeg[], decimal: number) {
    if (++visits > 50000) return;
    if (picked.length >= 2 && decimal >= 2 && decimal <= 3) {
      found.push({ bookmaker, legs: picked, decimal });
      return;
    }
    if (picked.length === Math.max(2, Math.min(8, maxLegs))) return;
    for (let i = start; i < legs.length && visits < 50000; i++) {
      const leg = legs[i],
        next = decimal * leg.quote.decimal;
      if (next > 3 || picked.some((p) => p.selection.fixture.id === leg.selection.fixture.id))
        continue;
      visit(i + 1, [...picked, leg], next);
    }
  }
  visit(0, [], 1);
  return found
    .sort(
      (a, b) =>
        Math.abs(a.decimal - 2.5) - Math.abs(b.decimal - 2.5) || a.legs.length - b.legs.length,
    )
    .slice(0, 3);
}
