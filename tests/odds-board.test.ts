import { expect, it, vi } from 'vitest';
import type { Context } from '@netlify/functions';
import handler from '../netlify/functions/api';
import { buildOddsBoard } from '../src/analysis/odds-board';
import { demoFixtures, demoMatch } from '../src/demo/data';
import { canonicalClubName } from '../src/domain/club-names';
import type { OddsSnapshot } from '../src/domain/spotlight';

const date = '2026-09-12';
const now = Date.parse(`${date}T08:00:00Z`);
const data = demoMatch(demoFixtures(date)[0].id)!;
const fixture = data.fixture;
const priced: OddsSnapshot = {
  source: 'synthetic feed',
  kind: 'feed',
  fetchedAt: new Date(now).toISOString(),
  message: '',
  quotes: [
    {
      home: canonicalClubName(fixture.home.name)!,
      away: canonicalClubName(fixture.away.name)!,
      date,
      kickoff: fixture.kickoff,
      market: 'over15',
      bookmaker: 'Unibet België',
      decimal: 1.8,
      observedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    },
    {
      home: 'Unrelated club',
      away: canonicalClubName(fixture.away.name)!,
      date,
      kickoff: fixture.kickoff,
      market: 'over15',
      bookmaker: 'Unibet België',
      decimal: 9.99,
      observedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    },
  ],
};

it('groups only matching real prices with the existing model and preserves unsupported markets', () => {
  const board = buildOddsBoard([data], priced, now);
  expect(board.matches).toHaveLength(1);
  const markets = board.matches[0].markets;
  expect(markets.map((market) => market.key)).toEqual([
    'home',
    'draw',
    'away',
    'over05',
    'over15',
    'over25',
    'over35',
    'under25',
    'btts',
  ]);
  expect(markets.find((market) => market.key === 'over15')).toMatchObject({
    probability: expect.any(Number),
    quotes: [{ decimal: 1.8 }],
  });
  expect(markets.find((market) => market.key === 'over05')).toMatchObject({
    probability: null,
    quotes: [],
  });
  expect(board.odds).not.toHaveProperty('quotes');
});

it('does not list partial histories, finished matches or unknown pre-match kickoffs', () => {
  const partial = {
    ...data,
    availability: {
      status: 'partial' as const,
      source: 'test',
      updatedAt: new Date(now).toISOString(),
    },
  };
  expect(buildOddsBoard([partial], priced, now)).toMatchObject({ blockedFixtures: 1, matches: [] });
  expect(buildOddsBoard([data], priced, Date.parse(fixture.kickoff) + 1).matches).toEqual([]);
  const unknown = { ...data, fixture: { ...fixture, kickoffKnown: false } };
  expect(buildOddsBoard([unknown], priced, now).matches).toEqual([]);
});

it('keeps model evidence visible without making up bookmaker odds', () => {
  const board = buildOddsBoard([data], { ...priced, quotes: [] }, now);
  expect(board.matches[0].markets.some((market) => market.probability !== null)).toBe(true);
  expect(board.matches[0].markets.every((market) => market.quotes.length === 0)).toBe(true);
});

it('validates and serves the bounded daily board in demo mode', async () => {
  vi.stubEnv('DEMO_MODE', 'true');
  try {
    const response = await handler(
      new Request(`https://example.test/api/odds-board?date=${date}&days=1`),
      {} as Context,
    );
    expect(response.status).toBe(200);
    const board = await response.json();
    expect(board.matches).toHaveLength(4);
    expect(
      board.matches[0].markets.every((market: { quotes: unknown[] }) => !market.quotes.length),
    ).toBe(true);
    const invalid = await handler(
      new Request(`https://example.test/api/odds-board?date=${date}&days=100`),
      {} as Context,
    );
    expect(invalid.status).toBe(400);
  } finally {
    vi.unstubAllEnvs();
  }
});
