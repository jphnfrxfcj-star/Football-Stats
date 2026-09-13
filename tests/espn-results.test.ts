import { expect, it } from 'vitest';
import { applyResults } from '../server/providers/espn-results';
import { demoFixtures } from '../src/demo/data';
const f = demoFixtures('2026-09-12')[0];
const game = {
  date: f.kickoff,
  status: { type: { name: 'STATUS_FULL_TIME', completed: true } },
  competitors: [
    {
      homeAway: 'home',
      score: '2',
      team: { displayName: f.home.name },
      statistics: [{ name: 'totalShots', displayValue: '12' }],
    },
    { homeAway: 'away', score: '0', team: { displayName: f.away.name } },
  ],
};
const raw = { events: [{ id: '1', competitions: [game] }] };
it('fills delayed scores and statistics without inventing a halftime score', () => {
  const r = applyResults([f], raw, 'espn', '2026-09-13T10:00:00Z')[0];
  expect(r).toMatchObject({
    status: 'finished',
    homeGoals: 2,
    awayGoals: 0,
    halfHomeGoals: null,
    statistics: { home: { shots: 12 }, away: { shots: null } },
  });
  expect(r.provenance?.fields.score).toBe('espn-scoreboard');
});
it('ignores live scores, wrong teams or dates and preserves authoritative results', () => {
  for (const g of [
    { ...game, status: { type: { name: 'STATUS_IN_PROGRESS', completed: false } } },
    { ...game, date: '2026-09-01T10:00:00Z' },
    {
      ...game,
      competitors: game.competitors.map((c) => ({ ...c, team: { displayName: 'Unknown club' } })),
    },
  ])
    expect(
      applyResults([f], { events: [{ id: '1', competitions: [g] }] }, 'espn', '2026-09-13')[0],
    ).toEqual(f);
  const known = { ...f, status: 'finished' as const, homeGoals: 3, awayGoals: 0 };
  expect(applyResults([known], raw, 'espn', '2026-09-13')[0].homeGoals).toBe(3);
});
