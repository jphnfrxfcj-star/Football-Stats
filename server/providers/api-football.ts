import { z } from 'zod';
import {
  emptyMetrics,
  type Fixture,
  type League,
  type Team,
  type TeamMetrics,
  type Metric,
  type MatchEvent,
} from '../../src/domain/models';
import type { FootballDataProvider } from './provider';
const teamSchema = z.object({
  id: z.number(),
  name: z.string(),
  logo: z.string().nullable().optional(),
});
const score = z.number().nonnegative().nullable();
const fixtureSchema = z.object({
  fixture: z.object({
    id: z.number(),
    date: z.string(),
    venue: z.object({ name: z.string().nullable() }).nullable(),
    status: z.object({ short: z.string() }),
  }),
  league: z.object({
    id: z.number(),
    name: z.string(),
    country: z.string(),
    logo: z.string().nullable().optional(),
  }),
  teams: z.object({ home: teamSchema, away: teamSchema }),
  goals: z.object({ home: score, away: score }),
  score: z.object({
    halftime: z.object({ home: score, away: score }),
    fulltime: z.object({ home: score, away: score }),
  }),
});
const ref = (id: number) => [{ provider: 'api-football', externalId: String(id) }];
const normalizeTeam = (t: z.infer<typeof teamSchema>): Team => ({
  id: `af-team-${t.id}`,
  name: t.name,
  shortName: t.name.slice(0, 3).toUpperCase(),
  logo: t.logo ?? null,
  color: '#65766c',
  refs: ref(t.id),
});
export function normalizeFixture(raw: unknown): Fixture {
  const f = fixtureSchema.parse(raw),
    s = f.fixture.status.short;
  // Goal markets use regulation-time results; extra time and penalties are excluded.
  const goals = ['AET', 'PEN'].includes(s) ? f.score.fulltime : f.goals;
  return {
    id: `af-fixture-${f.fixture.id}`,
    refs: ref(f.fixture.id),
    league: {
      id: `af-league-${f.league.id}`,
      name: f.league.name,
      country: f.league.country,
      logo: f.league.logo ?? null,
      refs: ref(f.league.id),
    },
    home: normalizeTeam(f.teams.home),
    away: normalizeTeam(f.teams.away),
    kickoff: f.fixture.date,
    venue: f.fixture.venue?.name ?? null,
    status: ['FT', 'AET', 'PEN'].includes(s)
      ? 'finished'
      : ['NS', 'TBD'].includes(s)
        ? 'scheduled'
        : ['PST', 'SUSP', 'INT'].includes(s)
          ? 'postponed'
          : ['CANC', 'ABD', 'AWD', 'WO'].includes(s)
            ? 'cancelled'
            : 'live',
    homeGoals: goals.home,
    awayGoals: goals.away,
    halfHomeGoals: f.score.halftime.home,
    halfAwayGoals: f.score.halftime.away,
    statistics: null,
  };
}
export class ApiFootballProvider implements FootballDataProvider {
  readonly name = 'api-football';
  constructor(
    private key: string,
    private league = '39',
    private season = '2026',
  ) {}
  private async get(path: string, params: Record<string, string> = {}): Promise<unknown[]> {
    const response = await fetch(
      `https://v3.football.api-sports.io/${path}?${new URLSearchParams(params)}`,
      { headers: { 'x-apisports-key': this.key }, signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) throw new Error(`Football provider returned HTTP ${response.status}`);
    const body = z
      .object({
        errors: z.union([z.array(z.unknown()), z.record(z.unknown())]),
        response: z.array(z.unknown()),
        paging: z.object({ current: z.number(), total: z.number() }).optional(),
      })
      .parse(await response.json());
    if (Object.keys(body.errors).length)
      throw new Error('Football provider rejected request; check plan coverage or quota.');
    if (body.paging && body.paging.total > 1)
      throw new Error('Provider response is paginated; refusing incomplete data.');
    return body.response;
  }
  async leagues(): Promise<League[]> {
    return (await this.get('leagues', { id: this.league, season: this.season })).map((raw) => {
      const r = z
        .object({
          league: z.object({ id: z.number(), name: z.string(), logo: z.string().nullable() }),
          country: z.object({ name: z.string() }),
        })
        .parse(raw);
      return {
        id: `af-league-${r.league.id}`,
        name: r.league.name,
        country: r.country.name,
        logo: r.league.logo,
        refs: ref(r.league.id),
      };
    });
  }
  async fixtures(date: string) {
    return (
      await this.get('fixtures', {
        date,
        league: this.league,
        season: this.season,
        timezone: 'UTC',
      })
    ).map(normalizeFixture);
  }
  async fixture(id: string) {
    const raw = await this.get('fixtures', { id });
    return raw.length ? normalizeFixture(raw[0]) : null;
  }
  async history(team: string, beforeDate: string) {
    // Bounded season fetch avoids historical-analysis look-ahead from last=N.
    const year = Number(this.season);
    const from = `${year}-07-01`,
      to = new Date(Date.parse(beforeDate) - 86400000).toISOString().slice(0, 10);
    if (to < from) return [];
    return (
      await this.get('fixtures', {
        team,
        league: this.league,
        season: this.season,
        from,
        to,
        status: 'FT-AET-PEN',
      })
    )
      .map(normalizeFixture)
      .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
      .slice(0, 60);
  }
  async h2h(home: string, away: string, beforeDate: string) {
    return (
      await this.get('fixtures/headtohead', {
        h2h: `${home}-${away}`,
        from: '2010-01-01',
        to: new Date(Date.parse(beforeDate) - 86400000).toISOString().slice(0, 10),
        status: 'FT-AET-PEN',
      })
    )
      .map(normalizeFixture)
      .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
      .slice(0, 10);
  }
  async statistics(fixture: Fixture) {
    const id = fixture.refs.find((r) => r.provider === this.name)?.externalId;
    if (!id) throw new Error('Missing fixture provider reference');
    const raw = await this.get('fixtures/statistics', { fixture: id });
    if (!raw.length) return null;
    const map: Record<string, Metric> = {
      'Total Shots': 'shots',
      'Shots on Goal': 'shotsOnTarget',
      'Ball Possession': 'possession',
      'Corner Kicks': 'corners',
      Fouls: 'fouls',
      'Yellow Cards': 'yellowCards',
      'Red Cards': 'redCards',
      expected_goals: 'xg',
      'Big Chances': 'bigChances',
    };
    const result = { home: emptyMetrics(), away: emptyMetrics() };
    for (const item of raw) {
      const r = z
        .object({
          team: z.object({ id: z.number() }),
          statistics: z.array(
            z.object({ type: z.string(), value: z.union([z.number(), z.string(), z.null()]) }),
          ),
        })
        .parse(item);
      const side =
        r.team.id === Number(fixture.home.refs.find((r) => r.provider === this.name)?.externalId)
          ? 'home'
          : r.team.id ===
              Number(fixture.away.refs.find((r) => r.provider === this.name)?.externalId)
            ? 'away'
            : null;
      if (!side) continue;
      for (const stat of r.statistics) {
        const key = map[stat.type];
        if (!key) continue;
        const v =
          stat.value === null || stat.value === ''
            ? null
            : Number(String(stat.value).replace('%', ''));
        result[side][key] = v !== null && Number.isFinite(v) ? v : null;
      }
    }
    return result;
  }
  async events(id: string): Promise<MatchEvent[]> {
    return (await this.get('fixtures/events', { fixture: id })).map((item) => {
      const r = z
        .object({
          time: z.object({ elapsed: z.number(), extra: z.number().nullable() }),
          team: z.object({ id: z.number() }),
          player: z.object({ name: z.string().nullable() }),
          type: z.string(),
          detail: z.string(),
        })
        .parse(item);
      return {
        minute: r.time.elapsed,
        extra: r.time.extra,
        teamId: `af-team-${r.team.id}`,
        player: r.player.name,
        type: r.type,
        detail: r.detail,
      };
    });
  }
}
