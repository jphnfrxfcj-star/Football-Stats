import { expect, it } from 'vitest';
import { marketOutcome, priceAssessment, selectionEvidence } from '../src/analysis/bet-evidence';
import { demoMatch, demoFixtures } from '../src/demo/data';
const fixture = demoFixtures('2026-09-14')[0],
  data = demoMatch(fixture.id)!;
it('compares the break-even price with a model, independently of historical percentages', () => {
  expect(priceAssessment(2, 60)).toEqual({ implied: 50, model: 60, gap: 10 });
  expect(priceAssessment(2, null)?.gap).toBeNull();
  for (const p of [1, 0, NaN, Infinity, -2]) expect(priceAssessment(p, 60)).toBeNull();
});
it('uses team-relative historical results for upcoming home and away selections', () => {
  const row = { ...fixture, status: 'finished' as const, homeGoals: 2, awayGoals: 1 };
  expect(marketOutcome(row, fixture.home.id, 'home', 'home')).toBe(true);
  expect(marketOutcome(row, fixture.away.id, 'away', 'home')).toBe(true);
  expect(marketOutcome({ ...row, homeGoals: null }, fixture.home.id, 'home', 'home')).toBeNull();
});
it('counts conditions jointly, not by multiplying their marginal frequencies', () => {
  const rows = [0, 1, 2, 3, 4].map((i) => ({
    ...fixture,
    id: `row${i}`,
    kickoff: `2026-09-0${i + 1}T10:00:00Z`,
    status: 'finished' as const,
    homeGoals: i === 0 ? 0 : 2,
    awayGoals: i === 1 ? 0 : 1,
  }));
  const report = selectionEvidence(
    { ...data, fixture, homeHistory: rows, awayHistory: rows },
    ['over25', 'btts'],
    5,
    Date.parse('2026-09-13'),
  );
  expect(report[0].frequency).toEqual({ successes: 3, total: 5, percentage: 60 });
  const missing = selectionEvidence(
    { ...data, fixture, homeHistory: [{ ...rows[0], homeGoals: null }, ...rows.slice(1)] },
    ['over25', 'btts'],
    5,
    Date.parse('2026-09-13'),
  );
  expect(missing[0].frequency.total).toBe(4);
});
