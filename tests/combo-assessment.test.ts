import { expect, it } from 'vitest';
import {
  assessComboPrice,
  comboModelEvidence,
  goalMarketProbability,
} from '../src/analysis/combo-assessment';
import { weightedMarket } from '../src/analysis/engine';
import { buildMarkets, suggestCombinations } from '../src/analysis/combinations';
import { demoMatch } from '../src/demo/data';
import type { Fixture, MatchData } from '../src/domain/models';
import type { OddsQuote } from '../src/domain/spotlight';
const now = Date.parse('2026-09-12T08:00:00Z');
const base = demoMatch('demo-2026-09-14-0')!;
function data(success: (i: number) => boolean = () => true): MatchData {
  const history = (side: 'home' | 'away') =>
    Array.from({ length: 20 }, (_, i): Fixture => {
      const team = base.fixture[side],
        opponent = { ...team, id: `opponent-${side}-${i}` };
      return {
        ...base.fixture,
        id: `${side}-${i}`,
        status: 'finished',
        kickoff: new Date(now - (i + 1) * 7 * 86400000).toISOString(),
        home: i % 2 === 0 ? team : opponent,
        away: i % 2 === 0 ? opponent : team,
        homeGoals: success(i) ? 2 : 0,
        awayGoals: success(i) ? 2 : 0,
        halfHomeGoals: 1,
        halfAwayGoals: 0,
      };
    });
  return { ...base, homeHistory: history('home'), awayHistory: history('away'), h2h: [] };
}
const quote: OddsQuote = {
  home: base.fixture.home.name,
  away: base.fixture.away.name,
  date: base.fixture.kickoff.slice(0, 10),
  kickoff: base.fixture.kickoff,
  market: 'btts',
  bookmaker: 'Test',
  decimal: 1.6,
  updatedAt: new Date(now).toISOString(),
};
const selection = (d = data()) => ({
  model: comboModelEvidence(d, 'btts', now),
  oddsKind: 'feed' as const,
});

it('rejects a short 80% BTTS streak at 1.60 when the longer history/goals do not support the price', () => {
  const d = data((i) => i < 4 || (i >= 5 && i % 3 === 0));
  const report = buildMarkets(
    [d],
    {
      kind: 'feed',
      source: 'Test',
      fetchedAt: new Date(now).toISOString(),
      message: '',
      quotes: [quote],
    },
    5,
    now,
    80,
  );
  const btts = report.selections.find((s) => s.market === 'btts')!;
  expect(btts).toBeDefined();
  expect(btts.model!.homeLast5.successes).toBe(4);
  expect(assessComboPrice(btts, quote, now).status).toBe('insufficient-margin');
});
it('requires both models to clear break-even plus the explicit margin, without rounding', () => {
  const s = selection();
  expect(assessComboPrice(s, quote, now).status).toBe('passes');
  for (const key of ['weightedProbability', 'goalsProbability'] as const) {
    expect(
      assessComboPrice({ ...s, model: { ...s.model, [key]: 67.4999 } }, quote, now).status,
    ).toBe('insufficient-margin');
    expect(assessComboPrice({ ...s, model: { ...s.model, [key]: 67.5 } }, quote, now).status).toBe(
      'passes',
    );
  }
});
it('fails closed for missing model data, incomplete histories and unknown/stale/snapshot prices', () => {
  expect(assessComboPrice({}, quote, now).status).toBe('insufficient-history');
  const d = data();
  d.homeHistory[10].homeGoals = null;
  expect(assessComboPrice(selection(d), quote, now).status).toBe('insufficient-history');
  const s = selection();
  for (const updatedAt of [
    null,
    'invalid',
    new Date(now + 1).toISOString(),
    new Date(now - 900001).toISOString(),
  ])
    expect(assessComboPrice(s, { ...quote, updatedAt }, now).status).toBe('unverified-price');
  expect(assessComboPrice({ ...s, oddsKind: 'snapshot' }, quote, now).status).toBe(
    'unverified-price',
  );
  expect(
    assessComboPrice(s, { ...quote, updatedAt: new Date(now - 900000).toISOString() }, now).status,
  ).toBe('passes');
});
it('gives recent H2H successes more weight than old ones with identical 2/4 totals', () => {
  const d = data();
  const heads = [30, 180, 800, 1200].map((days, i) => ({
    ...base.fixture,
    id: `h2h-${i}`,
    status: 'finished' as const,
    kickoff: new Date(now - days * 86400000).toISOString(),
    homeGoals: i < 2 ? 1 : 0,
    awayGoals: i < 2 ? 1 : 0,
  }));
  const recent = comboModelEvidence({ ...d, h2h: heads }, 'btts', now);
  const old = comboModelEvidence(
    {
      ...d,
      h2h: heads.map((f) => ({ ...f, homeGoals: 1 - f.homeGoals, awayGoals: 1 - f.awayGoals })),
    },
    'btts',
    now,
  );
  expect(recent.h2h).toEqual(old.h2h);
  expect(recent.weightedProbability!).toBeGreaterThan(old.weightedProbability!);
  expect(Math.abs(recent.weightedProbability! - old.weightedProbability!)).toBeLessThan(3);
});
it('exposes recent improvements and gives the last five games more weight', () => {
  const improving = comboModelEvidence(
    data((i) => i < 5 || i >= 10),
    'btts',
    now,
  );
  const declining = comboModelEvidence(
    data((i) => i >= 5),
    'btts',
    now,
  );
  expect(improving.homeLast5.successes).toBe(5);
  expect(improving.homePrevious5.successes).toBe(0);
  expect(improving.weightedProbability!).toBeGreaterThan(declining.weightedProbability!);
  expect(improving.goalsProbability!).toBeGreaterThan(declining.goalsProbability!);
});
it('excludes future results even before a later fixture and counts shared games once', () => {
  const d = data();
  const current = comboModelEvidence(d, 'btts', now);
  const future = {
    ...d.homeHistory[0],
    id: 'future',
    kickoff: new Date(now + 86400000).toISOString(),
    homeGoals: 0,
    awayGoals: 0,
  };
  expect(
    comboModelEvidence({ ...d, homeHistory: [future, ...d.homeHistory] }, 'btts', now),
  ).toEqual(current);
  const shared = { ...d.homeHistory[0], home: d.fixture.home, away: d.fixture.away };
  const h = { ...d, homeHistory: [shared], awayHistory: [shared], h2h: [shared] };
  expect(weightedMarket(h, 'btts').sampleSize).toBe(1);
});
it('computes BTTS from two scoring processes and preserves complementary goal markets', () => {
  const d = data();
  expect(goalMarketProbability(d, 'btts')).toBeCloseTo((1 - Math.exp(-2)) ** 2 * 100);
  expect(goalMarketProbability(d, 'over25')! + goalMarketProbability(d, 'under25')!).toBeCloseTo(
    100,
  );
  d.homeHistory.forEach((f) => {
    f.halfHomeGoals = null;
    f.halfAwayGoals = null;
  });
  expect(goalMarketProbability(d, 'firstHalf05')).toBeNull();
});
it('never fills a checked combination with a rejected leg to reach higher odds', () => {
  const report = buildMarkets(
    [data()],
    {
      kind: 'feed',
      source: 'Test',
      fetchedAt: new Date(now).toISOString(),
      message: '',
      quotes: [quote],
    },
    5,
    now,
    80,
  );
  const first = report.selections.find((s) => s.market === 'btts')!;
  const second = {
    ...first,
    id: 'second',
    fixture: {
      ...first.fixture,
      id: 'second',
      home: { ...first.fixture.home, id: 'h2' },
      away: { ...first.fixture.away, id: 'a2' },
    },
    model: { ...first.model!, goalsProbability: 63 },
  };
  expect(suggestCombinations([first, second], 'Test', now, 8)).toHaveLength(1);
  expect(
    suggestCombinations([first, second], 'Test', now, 8, { requirePriceCheck: true }),
  ).toHaveLength(0);
  expect(
    suggestCombinations([first, second], 'Test', now, 8, {
      requirePriceCheck: true,
      maxOdd: 20,
      diverse: true,
    }),
  ).toHaveLength(0);
});

it('accepts a recently observed unchanged feed price without treating a fresh response envelope as a new observation', () => {
  const stable = {
    ...quote,
    updatedAt: '2026-09-01T08:00:00Z',
    observedAt: new Date(now).toISOString(),
  };
  expect(assessComboPrice(selection(), stable, now).status).toBe('passes');
  expect(assessComboPrice(selection(), stable, now + 900001).status).toBe('unverified-price');
  expect(assessComboPrice(selection(), { ...stable, observedAt: undefined }, now).status).toBe(
    'unverified-price',
  );
});

it('saves the original model assessment alongside a proposal without rewriting older records', async () => {
  const { saveProposal, readHistory } = await import('../src/domain/combo-history');
  const report = buildMarkets(
    [data()],
    {
      kind: 'feed',
      source: 'Test',
      fetchedAt: new Date(now).toISOString(),
      message: '',
      quotes: [quote],
    },
    5,
    now,
    80,
  );
  const first = report.selections.find((s) => s.market === 'btts')!;
  const second = {
    ...first,
    id: 'second',
    fixture: {
      ...first.fixture,
      id: 'second',
      home: { ...first.fixture.home, id: 'h2' },
      away: { ...first.fixture.away, id: 'a2' },
    },
  };
  const [combo] = suggestCombinations([first, second], 'Test', now, 8, { requirePriceCheck: true });
  const saved = saveProposal(combo, 5, 80, now)!;
  expect(saved.priceChecked).toBe(true);
  expect(saved.legs[0].assessment?.status).toBe('passes');
  const initial = saved.legs[0].assessment!.goalsProbability;
  first.model!.goalsProbability = 1;
  expect(
    readHistory(JSON.stringify({ version: 1, combos: [saved] }))[0].legs[0].assessment!
      .goalsProbability,
  ).toBe(initial);
});

it('ranks assessed proposals without hiding lower-rated ones, even with market variation', () => {
  const report = buildMarkets(
    [data()],
    {
      kind: 'feed',
      source: 'Test',
      fetchedAt: new Date(now).toISOString(),
      message: '',
      quotes: [quote],
    },
    5,
    now,
    80,
  );
  const first = report.selections.find((s) => s.market === 'btts')!;
  const rows = Array.from({ length: 4 }, (_, i) => ({
    ...first,
    id: `rank-${i}`,
    fixture: {
      ...first.fixture,
      id: `rank-${i}`,
      home: { ...first.fixture.home, id: `home-${i}` },
      away: { ...first.fixture.away, id: `away-${i}` },
    },
    model: {
      ...first.model!,
      weightedProbability: i < 2 ? 80 : 50,
      goalsProbability: i < 2 ? 75 : 40,
    },
  }));
  for (const diverse of [false, true]) {
    const combos = suggestCombinations(rows, 'Test', now, 8, {
      rankByAssessment: true,
      limit: 9,
      diverse,
    });
    expect(combos).toHaveLength(6);
    expect(combos[0].legs.map((l) => l.selection.id).sort()).toEqual(['rank-0', 'rank-1']);
    expect(combos.some((c) => c.legs.some((l) => l.selection.id === 'rank-3'))).toBe(true);
    expect(combos.every((c) => c.evaluationMode === 'review' && !c.priceChecked)).toBe(true);
  }
});
it('never selects an older passing price when a newer failing price exists', () => {
  const report = buildMarkets(
    [data()],
    {
      kind: 'feed',
      source: 'Test',
      fetchedAt: new Date(now).toISOString(),
      message: '',
      quotes: [quote],
    },
    5,
    now,
    80,
  );
  const s = report.selections.find((s) => s.market === 'btts')!;
  const newer = { ...quote, decimal: 1.1, observedAt: new Date(now).toISOString() };
  const old = { ...quote, observedAt: new Date(now - 60000).toISOString() };
  const a = { ...s, quotes: [old, newer] };
  const b = {
    ...s,
    id: 'other',
    fixture: {
      ...s.fixture,
      id: 'other',
      home: { ...s.fixture.home, id: 'h2' },
      away: { ...s.fixture.away, id: 'a2' },
    },
  };
  expect(suggestCombinations([a, b], 'Test', now, 8, { requirePriceCheck: true })).toHaveLength(0);
});
