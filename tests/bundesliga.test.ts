import { expect, it } from 'vitest';
import { canonicalClubName } from '../src/domain/club-names';
import { normalizeOrg, orgUrl } from '../server/providers/football-data-org';
import { normalizeSchedule } from '../server/providers/free-football';

it('keeps Bundesliga identity across schedule and fallback, including former league clubs', () => {
  const fetchedAt = '2026-09-21T08:00:00Z';
  const fixture = normalizeOrg(
    {
      fetchedAt,
      text: JSON.stringify({
        matches: [
          {
            id: 1,
            utcDate: '2025-09-20T13:30:00Z',
            competition: { code: 'BL1' },
            season: { startDate: '2025-08-01' },
            status: 'FINISHED',
            homeTeam: { name: 'FC St. Pauli 1910' },
            awayTeam: { name: 'FC Bayern München' },
            score: { fullTime: { home: 0, away: 2 } },
          },
        ],
      }),
    },
    2025,
    'D1',
  )[0];
  const scheduled = normalizeSchedule(
    {
      fetchedAt,
      text: JSON.stringify({
        matches: [
          {
            date: '2025-09-20',
            time: '15:30',
            team1: 'FC St. Pauli',
            team2: 'Bayern Munich',
          },
        ],
      }),
    },
    2025,
    'schedule',
    'D1',
  )[0];
  expect(fixture.id).toBe(scheduled.id);
  expect(fixture.league.id).toBe('free-league-d1');
  expect(fixture.homeGoals).toBe(0);
  expect(fixture.halfHomeGoals).toBeNull();
  expect(orgUrl(2026, 'D1')).toContain('/BL1/matches?season=2026');
  expect(canonicalClubName('Borussia Mönchengladbach')).toBe(
    canonicalClubName('Borussia M.Gladbach'),
  );
  expect(canonicalClubName('Bayern Munich II')).toBeNull();
});
