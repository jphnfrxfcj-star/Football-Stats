import {
  emptyMetrics,
  type Fixture,
  type League,
  type MatchData,
  type Team,
} from '../domain/models';
export const demoLeague: League = {
  id: 'demo-pl',
  name: 'Premier League',
  country: 'Engeland',
  logo: null,
  refs: [],
};
const team = (id: string, name: string, shortName: string, color: string): Team => ({
  id,
  name,
  shortName,
  color,
  logo: null,
  refs: [],
});
export const demoTeams = [
  team('ars', 'Arsenal', 'ARS', '#dc4549'),
  team('che', 'Chelsea', 'CHE', '#3975e3'),
  team('mci', 'Manchester City', 'MCI', '#71b9db'),
  team('liv', 'Liverpool', 'LIV', '#d94d54'),
  team('tot', 'Tottenham', 'TOT', '#677594'),
  team('new', 'Newcastle', 'NEW', '#636c6b'),
  team('avl', 'Aston Villa', 'AVL', '#8a5475'),
  team('bha', 'Brighton', 'BHA', '#3d83d2'),
];
export const today = () => new Date().toISOString().slice(0, 10);
export function demoFixtures(date = today()): Fixture[] {
  return [0, 1, 2, 3].map((n) => ({
    id: `demo-${date}-${n}`,
    refs: [],
    league: demoLeague,
    home: demoTeams[n * 2],
    away: demoTeams[n * 2 + 1],
    kickoff: `${date}T${[16, 14, 18, 19][n]}:30:00Z`,
    venue: ['Emirates Stadium', 'Etihad Stadium', 'Tottenham Hotspur Stadium', 'Villa Park'][n],
    status: 'scheduled',
    homeGoals: null,
    awayGoals: null,
    halfHomeGoals: null,
    halfAwayGoals: null,
    statistics: null,
  }));
}
export function demoMatch(id: string): MatchData | null {
  const match = id.match(/^demo-(\d{4}-\d{2}-\d{2})-([0-3])$/);
  if (!match) return null;
  const fixture = demoFixtures(match[1])[Number(match[2])];
  const history = (t: Team, offset: number): Fixture[] =>
    Array.from({ length: 40 }, (_, i) => {
      const opponent = demoTeams.filter((o) => o.id !== t.id)[(i + offset) % 7];
      const home = i % 2 === 0;
      const gf = [2, 3, 1, 2, 0, 4, 2, 1, 3, 2, 1][(i + offset) % 11],
        ga = [1, 0, 2, 1, 1, 0, 2, 0, 1][(i + offset) % 9];
      const metrics = (seed: number) => ({
        ...emptyMetrics(),
        shots: 10 + (seed % 9),
        shotsOnTarget: 3 + (seed % 5),
        possession: 45 + (seed % 18),
        corners: 3 + (seed % 6),
        fouls: 7 + (seed % 8),
        yellowCards: 1 + (seed % 3),
        redCards: seed % 17 === 0 ? 1 : 0,
        xg: Number((0.8 + (seed % 20) / 10).toFixed(1)),
      });
      return {
        id: `demo-history-${t.id}-${i}`,
        refs: [],
        league: demoLeague,
        home: home ? t : opponent,
        away: home ? opponent : t,
        kickoff: new Date(
          Date.parse(fixture.kickoff) - (i + 1) * 7 * 86400000 - offset * 86400000,
        ).toISOString(),
        venue: null,
        status: 'finished',
        homeGoals: home ? gf : ga,
        awayGoals: home ? ga : gf,
        halfHomeGoals: i % 6 === 0 ? null : Math.floor((home ? gf : ga) / 2),
        halfAwayGoals: i % 6 === 0 ? null : Math.floor((home ? ga : gf) / 2),
        statistics:
          i % 7 === 0 ? null : { home: metrics(i + offset), away: metrics(i + offset + 3) },
      };
    });
  const homeHistory = history(fixture.home, 0),
    awayHistory = history(fixture.away, 2);
  const h2h: Fixture[] = Array.from({ length: 10 }, (_, i) => ({
    ...homeHistory[i],
    id: `demo-h2h-${i}`,
    home: i % 2 === 0 ? fixture.home : fixture.away,
    away: i % 2 === 0 ? fixture.away : fixture.home,
    kickoff: new Date(Date.parse(fixture.kickoff) - (i + 1) * 160 * 86400000).toISOString(),
  }));
  return {
    fixture,
    homeHistory,
    awayHistory,
    h2h,
    source: 'demo',
    updatedAt: new Date().toISOString(),
    warnings: [
      'Voorbeeldgegevens: wedstrijden en statistieken zijn synthetisch en niet geschikt voor echte voorspellingen.',
    ],
  };
}
