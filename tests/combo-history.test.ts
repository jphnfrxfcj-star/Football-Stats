import { expect, it } from 'vitest';
import { demoFixtures } from '../src/demo/data';
import {
  evaluateProposal,
  readHistory,
  savedComboSchema,
  type SavedCombo,
} from '../src/domain/combo-history';
const fixtures = demoFixtures('2026-09-12').slice(0, 2);
const combo: SavedCombo = {
  id: 'test',
  savedAt: '2026-09-10T10:00:00Z',
  bookmaker: 'Test',
  window: 5,
  minimumRate: 100,
  legs: fixtures.map((f) => ({
    fixtureId: f.id,
    homeId: f.home.id,
    awayId: f.away.id,
    home: f.home.name,
    away: f.away.name,
    league: f.league.name,
    kickoff: f.kickoff,
    market: 'over25',
    decimal: 1.5,
    homeHits: 5,
    awayHits: 5,
    quoteUpdatedAt: null,
  })),
};
it('keeps original snapshots across serialization and rejects post-kickoff recording', () => {
  expect(readHistory(JSON.stringify({ version: 1, combos: [combo] }))).toEqual([combo]);
  expect(savedComboSchema.safeParse({ ...combo, savedAt: '2026-09-13T00:00:00Z' }).success).toBe(
    false,
  );
  expect(
    savedComboSchema.safeParse({ ...combo, legs: [combo.legs[0], combo.legs[0]] }).success,
  ).toBe(false);
});
it('evaluates actual final results, with any losing leg losing the combination', () => {
  const results = new Map(
    fixtures.map((f) => [f.id, { ...f, status: 'finished' as const, homeGoals: 2, awayGoals: 1 }]),
  );
  expect(evaluateProposal(combo, results).status).toBe('won');
  results.get(fixtures[0].id)!.homeGoals = 0;
  expect(evaluateProposal(combo, results).status).toBe('lost');
  expect(evaluateProposal(combo, results).decimal).toBe(2.25);
});
it('does not turn unavailable results or missing half-time scores into losses', () => {
  expect(evaluateProposal(combo, new Map()).status).toBe('open');
  const results = new Map(
    fixtures.map((f) => [
      f.id,
      {
        ...f,
        status: 'finished' as const,
        homeGoals: 2,
        awayGoals: 1,
        halfHomeGoals: null,
        halfAwayGoals: null,
      },
    ]),
  );
  const half = {
    ...combo,
    legs: combo.legs.map((l) => ({ ...l, market: 'firstHalf05' as const })),
  };
  expect(evaluateProposal(half, results).status).toBe('unknown');
  expect(
    evaluateProposal(
      combo,
      new Map(fixtures.map((f) => [f.id, { ...f, status: 'cancelled' as const }])),
    ).status,
  ).toBe('unknown');
});
