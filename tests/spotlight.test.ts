import { describe, expect, it } from 'vitest';
import { buildSpotlight } from '../src/analysis/spotlight';
import { csvOdds, normalizeOdds } from '../server/providers/odds';
import { demoFixtures } from '../src/demo/data';
import type { OddsQuote, OddsSnapshot } from '../src/domain/spotlight';
import type { Probability } from '../src/analysis/probability';
const fixture = demoFixtures('2026-09-12')[0];
const now = Date.parse('2026-09-12T10:00:00Z');
const probability: Probability = {
  key: 'home',
  label: 'Thuis wint',
  value: 60,
  confidence: 'Laag',
  sampleSize: 20,
  factors: [],
};
const match = { fixture, probabilities: [probability], homeSamples: 20, awaySamples: 20 };
const quote: OddsQuote = {
  home: 'Arsenal',
  away: 'Chelsea',
  date: '2026-09-12',
  kickoff: fixture.kickoff,
  market: 'home',
  bookmaker: 'Test book',
  decimal: 2,
  updatedAt: '2026-09-12T09:59:00Z',
};
const snapshot: OddsSnapshot = {
  source: 'Test',
  kind: 'feed',
  fetchedAt: new Date(now).toISOString(),
  message: '',
  quotes: [quote],
};
describe('spotlight eligibility and value', () => {
  it('calculates fair odds and expected model edge from matching fresh prices', () => {
    const r = buildSpotlight([match], snapshot, now);
    expect(r.cards[0].fairOdds).toBeCloseTo(1 / 0.6);
    expect(r.cards[0].edgePercent).toBeCloseTo(20);
  });
  it.each([null, '2026-09-12T09:00:00Z', '2026-09-12T10:01:00Z'])(
    'does not call unverified, stale or future-dated odds value: %s',
    (updatedAt) => {
      expect(
        buildSpotlight([match], { ...snapshot, quotes: [{ ...quote, updatedAt }] }, now).cards[0]
          .edgePercent,
      ).toBeNull();
    },
  );
  it('never treats CSV snapshots as current value', () => {
    expect(
      buildSpotlight([match], { ...snapshot, kind: 'snapshot' }, now).cards[0].edgePercent,
    ).toBeNull();
  });
  it('does not match reversed teams, other dates, other kickoff times or other markets', () => {
    for (const other of [
      { ...quote, home: 'Chelsea', away: 'Arsenal' },
      { ...quote, date: '2026-09-13' },
      { ...quote, kickoff: '2026-09-12T19:00:00Z' },
      { ...quote, market: 'over25' },
    ]) {
      expect(
        buildSpotlight([match], { ...snapshot, quotes: [other] }, now).cards[0].quote,
      ).toBeNull();
    }
  });
  it('excludes started, cancelled, unknown-time and undersampled fixtures', () => {
    for (const candidate of [
      { ...match, fixture: { ...fixture, status: 'cancelled' as const } },
      { ...match, fixture: { ...fixture, kickoff: '2026-09-12T09:00:00Z' } },
      { ...match, fixture: { ...fixture, kickoffKnown: false } },
      { ...match, homeSamples: 3 },
    ]) {
      expect(buildSpotlight([candidate], snapshot, now).cards).toHaveLength(0);
    }
  });
  it('prefers a fresh price over a larger stale price and limits selection to one per match', () => {
    const r = buildSpotlight(
      [{ ...match, probabilities: [probability, { ...probability, key: 'over25', value: 80 }] }],
      { ...snapshot, quotes: [quote, { ...quote, decimal: 5, updatedAt: '2026-09-12T08:00:00Z' }] },
      now,
    );
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].quote?.decimal).toBe(2);
  });
});
it('parses CSV bookmaker odds without presenting maximum or average columns as bookmakers', () => {
  const r = csvOdds({
    fetchedAt: new Date(now).toISOString(),
    text: 'Div,Date,HomeTeam,AwayTeam,B365H,B365D,B365A,BFDH,MaxH\nE0,12/09/2026,Arsenal,Chelsea,2,3,4,2.1,8\n',
  });
  expect(r.quotes).toHaveLength(4);
  expect(r.quotes[3].bookmaker).toBe('Betfred');
  expect(r.quotes.every((q) => q.updatedAt === null)).toBe(true);
});
it('normalizes feed aliases and rejects non-decimal prices', () => {
  const event = {
    home_team: 'Tottenham Hotspur',
    away_team: 'Wolverhampton Wanderers',
    commence_time: '2026-09-12T14:00:00Z',
    bookmakers: [
      {
        key: 'test',
        title: 'Test',
        last_update: '2026-09-12T09:59:00Z',
        markets: [{ key: 'h2h', outcomes: [{ name: 'Tottenham Hotspur', price: 2 }] }],
      },
    ],
  };
  expect(normalizeOdds([event]).quotes[0]).toMatchObject({
    home: 'Tottenham',
    away: 'Wolves',
    market: 'home',
    decimal: 2,
  });
  event.bookmakers[0].markets[0].outcomes[0].price = 0;
  expect(() => normalizeOdds([event])).toThrow();
});

it('excludes exchange prices whose commission is not modeled', () => {
  const book = (key: string) => ({
    key,
    title: key,
    last_update: '2026-09-12T09:59:00Z',
    markets: [{ key: 'h2h', outcomes: [{ name: 'Arsenal', price: 2 }] }],
  });
  const r = normalizeOdds([
    {
      home_team: 'Arsenal',
      away_team: 'Chelsea',
      commence_time: '2026-09-12T14:00:00Z',
      bookmakers: [book('betfair_ex_eu'), book('matchbook'), book('smarkets'), book('betvictor')],
    },
  ]);
  expect(r.quotes).toHaveLength(1);
  expect(r.quotes[0].bookmaker).toBe('betvictor');
});
