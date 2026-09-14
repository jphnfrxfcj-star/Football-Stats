import { expect, it } from 'vitest';
import { demoFixtures } from '../src/demo/data';
import { programPrices } from '../src/analysis/program-prices';
import type { OddsSnapshot } from '../src/domain/spotlight';
const fixture = demoFixtures('2026-09-14')[0];
const now = Date.parse('2026-09-12T08:00:00Z');
const quote = {
  home: 'Arsenal',
  away: 'Chelsea',
  date: '2026-09-14',
  kickoff: fixture.kickoff,
  market: 'home',
  bookmaker: 'Unibet België',
  decimal: 1.03,
  updatedAt: null,
};
const report: OddsSnapshot = {
  source: 'test',
  kind: 'snapshot',
  fetchedAt: new Date(now).toISOString(),
  message: '',
  quotes: [
    quote,
    { ...quote, market: 'draw', decimal: 3.2 },
    { ...quote, market: 'away', decimal: 4.5 },
    { ...quote, bookmaker: 'Other', decimal: 2 },
  ],
};
it('shows actual 1X2 odds from one named bookmaker including prices below the combo threshold', () => {
  const p = programPrices(fixture, report, now);
  expect(p.bookmaker).toBe('Unibet België');
  expect(Object.keys(p.quotes)).toHaveLength(3);
  expect(p.quotes.home?.decimal).toBe(1.03);
  expect(p.snapshot).toBe(true);
});
it('labels the available alternative and never mixes unmatched games or stale dates', () => {
  const p = programPrices(
    fixture,
    {
      ...report,
      quotes: [
        { ...quote, bookmaker: 'Other' },
        { ...quote, date: '2026-09-15' },
        { ...quote, home: 'Liverpool' },
      ],
    },
    now,
  );
  expect(p.bookmaker).toBe('Other');
  expect(Object.keys(p.quotes)).toEqual(['home']);
  expect(programPrices({ ...fixture, status: 'finished' }, report, now).bookmaker).toBeNull();
  expect(programPrices(fixture, report, Date.parse(fixture.kickoff)).bookmaker).toBeNull();
});
