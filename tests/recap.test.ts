import { expect, it } from 'vitest';
import { dayRecap, isUpcoming, matchRecap } from '../src/analysis/recap';
import { demoFixtures } from '../src/demo/data';
const fixture = demoFixtures('2026-09-12')[0];
it('settles actual results and leaves missing half-time data unknown', () => {
  const f = { ...fixture, status: 'finished' as const, homeGoals: 2, awayGoals: 1 };
  const rows = matchRecap(f);
  expect(rows.find((r) => r.market === 'home')?.result).toBe(true);
  expect(rows.find((r) => r.market === 'away')?.result).toBe(false);
  expect(rows.find((r) => r.market === 'over25')?.result).toBe(true);
  expect(rows.find((r) => r.market === 'firstHalf05')?.result).toBeNull();
  expect(matchRecap(fixture)).toEqual([]);
  expect(dayRecap([fixture, f, { ...f, id: 'missing', homeGoals: null }])).toMatchObject({
    finished: 2,
    scored: 1,
    goals: 3,
    markets: [
      { market: 'over25', successes: 1, total: 1 },
      { market: 'btts', successes: 1, total: 1 },
    ],
  });
});
it('hides pre-match odds at kickoff, for completed games and unknown times', () => {
  const start = Date.parse(fixture.kickoff);
  expect(isUpcoming(fixture, start - 1)).toBe(true);
  expect(isUpcoming(fixture, start)).toBe(false);
  expect(isUpcoming({ ...fixture, status: 'finished' }, start - 1)).toBe(false);
  expect(isUpcoming({ ...fixture, kickoffKnown: false }, start - 1)).toBe(false);
});

it('preserves stored final results when the periodic schedule still has no score', async () => {
  const { preserveResult } = await import('../server/repositories/preserve-result');
  const stored = { ...fixture, status: 'finished' as const, homeGoals: 2, awayGoals: 1 };
  expect(preserveResult(fixture, stored)).toMatchObject({
    status: 'finished',
    homeGoals: 2,
    awayGoals: 1,
  });
  expect(preserveResult({ ...stored, homeGoals: 3 }, stored).homeGoals).toBe(3);
  expect(preserveResult({ ...fixture, id: 'different-match' }, stored).homeGoals).toBeNull();
});
