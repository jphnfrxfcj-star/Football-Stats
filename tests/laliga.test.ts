import { expect, it } from 'vitest';
import { normalizeCsv, normalizeSchedule, freeTeam } from '../server/providers/free-football';
import { MultiLeagueProvider } from '../server/providers/multi-league';
import { canonicalClubName } from '../src/domain/club-names';
import { normalizeUnibet } from '../server/providers/unibet';
const doc = (text: string) => ({ text, fetchedAt: '2026-09-13T10:00:00Z' });
it('aligns Spanish local schedules with UK-time CSV and keeps stable league identities', () => {
  const schedule = normalizeSchedule(
    doc(
      JSON.stringify({
        matches: [
          { date: '2026-08-15', time: '19:30', team1: 'Deportivo Alavés', team2: 'Getafe CF' },
        ],
      }),
    ),
    2026,
    'schedule',
    'SP1',
  )[0];
  const result = normalizeCsv(
    doc('Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\nSP1,15/08/2026,18:30,Alaves,Getafe,3,0\n'),
    2026,
    'csv',
    false,
    'SP1',
  )[0];
  expect(schedule.id).toBe(result.id);
  expect(schedule.kickoff).toBe('2026-08-15T17:30:00.000Z');
  expect(schedule.kickoff).toBe(result.kickoff);
  expect(result.league.id).toBe('free-league-sp1');
  expect(result.status).toBe('finished');
  for (const name of ['Ath Madrid', 'Club Atlético de Madrid', 'Atlético Madrid'])
    expect(canonicalClubName(name)).toBe(freeTeam(name).name);
});
it('exposes both leagues and routes Spanish history only through SP1 sources', async () => {
  const urls: string[] = [];
  const provider = new MultiLeagueProvider(2026, async (url) => {
    urls.push(url);
    return doc(
      url.includes('githubusercontent')
        ? JSON.stringify({ matches: [] })
        : 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n',
    );
  });
  expect((await provider.leagues()).map((l) => l.name)).toEqual(['Premier League', 'La Liga']);
  await provider.history('barcelona', '2026-09-14T10:00:00Z');
  expect(urls.some((u) => u.endsWith('/SP1.csv'))).toBe(true);
  expect(urls.some((u) => u.endsWith('/E0.csv'))).toBe(false);
});
it('maps Spanish Unibet markets with the reviewed La Liga group', () => {
  const result = normalizeUnibet(
    {
      events: [
        {
          id: 1,
          homeName: 'Villarreal',
          awayName: 'Real Betis',
          start: '2026-09-14T19:00:00Z',
          state: 'NOT_STARTED',
          sport: 'FOOTBALL',
          groupId: 1000095049,
        },
      ],
      betOffers: [
        {
          eventId: 1,
          criterion: { id: 1001159926 },
          outcomes: [{ id: 2, odds: 1300, line: 1500, type: 'OT_OVER', status: 'OPEN' }],
        },
      ],
    },
    Date.parse('2026-09-13'),
  );
  expect(result[0]).toMatchObject({
    home: 'Villarreal',
    away: 'Betis',
    market: 'over15',
    decimal: 1.3,
  });
});
