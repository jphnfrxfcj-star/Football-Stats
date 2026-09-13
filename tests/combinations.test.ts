import { describe, expect, it } from 'vitest';
import { buildMarkets, suggestCombinations, fixtureQuotes } from '../src/analysis/combinations';
import { demoFixtures } from '../src/demo/data';
import type { Fixture, MatchData } from '../src/domain/models';
import type { OddsSnapshot } from '../src/domain/spotlight';
const now = Date.parse('2026-09-12T10:00:00Z');
const fixtures = demoFixtures('2026-09-12');
function match(f: Fixture): MatchData {
  const history = (team: Fixture['home']) =>
    Array.from({ length: 5 }, (_, i): Fixture => ({
      ...f,
      id: `${team.id}-${i}`,
      home: team,
      away: { ...f.away, id: 'opponent' },
      kickoff: `2026-09-0${i + 1}T12:00:00Z`,
      status: 'finished',
      homeGoals: 2,
      awayGoals: 1,
      halfHomeGoals: 1,
      halfAwayGoals: 0,
    }));
  return {
    fixture: f,
    homeHistory: history(f.home),
    awayHistory: history(f.away),
    h2h: [],
    source: 'demo',
    updatedAt: new Date(now).toISOString(),
    warnings: [],
  };
}
const data = fixtures.map(match);
const odds: OddsSnapshot = {
  source: 'Test',
  kind: 'snapshot',
  message: '',
  fetchedAt: new Date(now).toISOString(),
  quotes: fixtures.flatMap((f) => [
    {
      home: f.home.name,
      away: f.away.name,
      date: '2026-09-12',
      kickoff: f.kickoff,
      market: 'over25',
      bookmaker: 'A',
      decimal: 1.6,
      updatedAt: null,
    },
    {
      home: f.home.name,
      away: f.away.name,
      date: '2026-09-12',
      kickoff: f.kickoff,
      market: 'over25',
      bookmaker: 'B',
      decimal: 1.2,
      updatedAt: null,
    },
  ]),
};
describe('historically perfect combinations', () => {
  it('requires a full window for both teams and preserves inspectable evidence', () => {
    const r = buildMarkets(data, odds, 5, now);
    const over = r.selections.filter((s) => s.market === 'over25');
    expect(over).toHaveLength(4);
    expect(over[0].homeEvidence).toHaveLength(5);
    expect(over[0].awayEvidence).toHaveLength(5);
    expect(buildMarkets(data, odds, 10, now).selections).toHaveLength(0);
    expect(buildMarkets([{ ...data[0], awayHistory: [] }], odds, 5, now).selections).toHaveLength(
      0,
    );
  });
  it('does not turn missing data or a losing observation into a 100% selection', () => {
    for (const value of [null, 0]) {
      const d = structuredClone(data[0]);
      d.homeHistory[0].homeGoals = value;
      d.homeHistory[0].awayGoals = 0;
      expect(buildMarkets([d], odds, 5, now).selections.some((s) => s.market === 'over25')).toBe(
        false,
      );
    }
    const d = structuredClone(data[0]);
    d.awayHistory[0].halfHomeGoals = null;
    expect(buildMarkets([d], odds, 5, now).selections.some((s) => s.market === 'firstHalf05')).toBe(
      false,
    );
  });
  it('excludes duplicates, future observations and started fixtures', () => {
    const d = structuredClone(data[0]);
    d.homeHistory[0] = d.homeHistory[1];
    expect(buildMarkets([d], odds, 5, now).selections).toHaveLength(0);
    d.homeHistory[0] = { ...data[0].homeHistory[0], kickoff: '2026-09-12T11:00:00Z' };
    expect(buildMarkets([d], odds, 5, now).selections).toHaveLength(0);
    expect(buildMarkets(data, odds, 5, Date.parse('2026-09-13')).fixtures).toHaveLength(0);
  });
  it('multiplies actual prices at one bookmaker with one leg per fixture', () => {
    const r = buildMarkets(data, odds, 5, now);
    const combos = suggestCombinations(r.selections, 'A', now);
    expect(combos.length).toBeGreaterThan(0);
    for (const c of combos) {
      expect(c.decimal).toBeCloseTo(2.56);
      expect(new Set(c.legs.map((l) => l.selection.fixture.id)).size).toBe(c.legs.length);
      expect(c.legs.every((l) => l.quote.bookmaker === 'A')).toBe(true);
    }
    expect(
      suggestCombinations(
        r.selections.filter((s) => s.fixture.id === fixtures[0].id),
        'A',
        now,
      ),
    ).toHaveLength(0);
    expect(suggestCombinations(r.selections, 'Unknown', now)).toHaveLength(0);
    expect(suggestCombinations(r.selections, 'A', Date.parse('2026-09-13'))).toHaveLength(0);
  });
  it('keeps unpriced patterns visible without manufacturing a combo', () => {
    const r = buildMarkets(data, { ...odds, quotes: [] }, 5, now);
    expect(r.selections.length).toBeGreaterThan(0);
    expect(suggestCombinations(r.selections, 'A', now)).toHaveLength(0);
  });
  it('does not attach prices for the wrong date, teams or kickoff', () => {
    const q = odds.quotes[0];
    for (const wrong of [
      { ...q, date: '2026-09-13' },
      { ...q, home: q.away, away: q.home },
      { ...q, kickoff: '2026-09-12T23:00:00Z' },
    ])
      expect(fixtureQuotes(fixtures[0], { ...odds, quotes: [wrong] })).toHaveLength(0);
  });
});

it('combines different dates and can reach the target with seven low-priced legs', () => {
  const r = buildMarkets(data, odds, 5, now);
  const base = r.selections.find((s) => s.market === 'over25')!;
  const selections = Array.from({ length: 7 }, (_, i) => ({
    ...base,
    id: `future-${i}:over25`,
    fixture: { ...base.fixture, id: `future-${i}`, kickoff: `2026-09-${13 + i}T14:00:00Z` },
    quotes: [{ ...base.quotes[0], decimal: 1.11 }],
  }));
  expect(suggestCombinations(selections, 'A', now)).toHaveLength(0);
  const combos = suggestCombinations(selections, 'A', now, 8);
  expect(combos[0].legs).toHaveLength(7);
  expect(combos[0].decimal).toBeCloseTo(1.11 ** 7);
  expect(combos[0].decimal).toBeGreaterThanOrEqual(2);
  expect(combos[0].decimal).toBeLessThanOrEqual(3);
});

it('only relaxes the historical threshold explicitly, with full observed windows', () => {
  const d = structuredClone(data[0]);
  d.homeHistory[0].homeGoals = 0;
  d.homeHistory[0].awayGoals = 0;
  expect(buildMarkets([d], odds, 5, now).selections.some((s) => s.market === 'over25')).toBe(false);
  expect(buildMarkets([d], odds, 5, now, 80).selections.some((s) => s.market === 'over25')).toBe(
    true,
  );
  expect(buildMarkets([d], odds, 5, now, 90).selections.some((s) => s.market === 'over25')).toBe(
    false,
  );
  d.homeHistory[0].homeGoals = null;
  expect(buildMarkets([d], odds, 5, now, 80).selections.some((s) => s.market === 'over25')).toBe(
    false,
  );
});
