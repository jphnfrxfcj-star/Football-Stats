import { expect, it } from 'vitest';
import { packMarketHistory, unpackMarketHistory } from '../server/market-history';
import { buildMarkets } from '../src/analysis/combinations';
import { demoMatch } from '../src/demo/data';
const now = Date.parse('2026-09-12T08:00:00Z');
const odds = {
  source: 'test',
  kind: 'snapshot' as const,
  fetchedAt: new Date(now).toISOString(),
  quotes: [],
  message: '',
};
it('preserves market qualification and evidence across every supported sample and threshold', () => {
  const data = demoMatch('demo-2026-09-14-0')!;
  const packed = packMarketHistory([data], now);
  const restored = unpackMarketHistory(packed);
  const summarize = (report: ReturnType<typeof buildMarkets>) =>
    report.selections.map((s) => ({
      id: s.id,
      home: s.homeEvidence.map((f) => [
        f.id,
        f.homeGoals,
        f.awayGoals,
        f.halfHomeGoals,
        f.halfAwayGoals,
      ]),
      away: s.awayEvidence.map((f) => [
        f.id,
        f.homeGoals,
        f.awayGoals,
        f.halfHomeGoals,
        f.halfAwayGoals,
      ]),
    }));
  for (const window of [5, 10, 20])
    for (const rate of [80, 90, 100])
      expect(summarize(buildMarkets(restored, odds, window, now, rate))).toEqual(
        summarize(buildMarkets([data], odds, window, now, rate)),
      );
  expect(restored[0].homeHistory.length).toBeLessThanOrEqual(20);
  expect(new Set(packed.fixtures.map((f) => f.id)).size).toBe(packed.fixtures.length);
});
it('stores shared histories once and excludes matches that have already started', () => {
  const data = demoMatch('demo-2026-09-14-0')!;
  const second = {
    ...data,
    fixture: { ...data.fixture, id: 'next', kickoff: '2026-09-15T18:00:00Z' },
  };
  const past = {
    ...data,
    fixture: { ...data.fixture, id: 'past', kickoff: '2026-09-11T18:00:00Z' },
  };
  const packed = packMarketHistory([data, second, past], now);
  expect(packed.matches).toHaveLength(2);
  expect(packed.matches[0].home).toEqual(packed.matches[1].home);
  expect(packed.fixtures.every((f) => f.statistics === null && f.provenance === undefined)).toBe(
    true,
  );
  expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify([data, second]).length / 2);
});
