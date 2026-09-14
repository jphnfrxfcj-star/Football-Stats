import { expect, it } from 'vitest';
import { competitions, fixtureDivision } from '../src/domain/competitions';
import { canonicalClubName } from '../src/domain/club-names';
import { freeTeam, normalizeSchedule, normalizeCsv } from '../server/providers/free-football';
import { MultiLeagueProvider } from '../server/providers/multi-league';
import { normalizeUnibet } from '../server/providers/unibet';
const doc = (text: string) => ({ text, fetchedAt: '2026-09-14T08:00:00Z' });
for (const [division, home, away, csvHome, csvAway] of [
  ['I1', 'Juventus FC', 'AC Milan', 'Juventus', 'Milan'],
  ['F1', 'Paris Saint-Germain FC', 'AS Monaco FC', 'Paris SG', 'Monaco'],
] as const) {
  it(`${division} aligns schedule/CSV/odds teams and converts local summer and winter kickoff`, () => {
    for (const [day, date, local, utc] of [
      ['2026-09-20', '20/09/2026', '20:45', '18:45'],
      ['2026-12-20', '20/12/2026', '20:45', '19:45'],
    ]) {
      const schedule = normalizeSchedule(
        doc(JSON.stringify({ matches: [{ date: day, time: local, team1: home, team2: away }] })),
        2026,
        'schedule',
        division,
      )[0];
      const csv = normalizeCsv(
        doc(
          `Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\n${division},${date},19:45,${csvHome},${csvAway},2,1\n`,
        ),
        2026,
        'csv',
        false,
        division,
      )[0];
      expect(schedule.id).toBe(csv.id);
      expect(schedule.kickoff).toBe(`${day}T${utc}:00.000Z`);
      expect(schedule.kickoff).toBe(csv.kickoff);
      expect(fixtureDivision(schedule)).toBe(division);
      expect(canonicalClubName(home)).toBe(freeTeam(csvHome).name);
      expect(schedule.home.logo).toMatch(/^\/clubs\//);
    }
    const quotes = normalizeUnibet(
      {
        events: [
          {
            id: 1,
            homeName: csvHome,
            awayName: csvAway,
            start: '2026-09-20T18:45:00Z',
            state: 'NOT_STARTED',
            sport: 'FOOTBALL',
            groupId: competitions[division].group,
          },
        ],
        betOffers: [
          {
            eventId: 1,
            criterion: { id: 1001159858 },
            outcomes: [{ id: 1, odds: 1800, type: 'OT_ONE', status: 'OPEN' }],
          },
        ],
      },
      Date.parse('2026-09-14'),
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0].home).toBe(freeTeam(home).name);
  });
  it(`${division} routes history to its own league`, async () => {
    const urls: string[] = [];
    const provider = new MultiLeagueProvider(2026, async (url) => {
      urls.push(url);
      return doc(
        url.includes('githubusercontent')
          ? JSON.stringify({ matches: [] })
          : 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\n',
      );
    });
    await provider.history(freeTeam(home).refs[0].externalId, '2026-09-14T00:00:00Z');
    expect(urls.some((u) => u.endsWith(`/${division}.csv`))).toBe(true);
    expect(
      urls
        .filter((u) => /\/(E0|SP1|I1|F1)\.csv$/.test(u))
        .every((u) => u.endsWith(`/${division}.csv`)),
    ).toBe(true);
  });
}
