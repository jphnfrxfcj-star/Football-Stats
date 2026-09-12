import { clubLogo } from '../../src/domain/club-assets';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import {
  before,
  emptyMetrics,
  type Fixture,
  type League,
  type Metric,
  type Team,
  type SourceStamp,
} from '../../src/domain/models';
import { ServiceError } from '../errors';
import type { FootballDataProvider } from './provider';

export const FREE_PROVIDER = 'free-football';
export const CSV_PROVIDER = 'football-data-co-uk';
export interface SourceDocument {
  text: string;
  fetchedAt: string;
}
export type SourceReader = (url: string, ttl: number) => Promise<SourceDocument>;
const aliases: Record<string, string[]> = {
  Arsenal: ['Arsenal FC'],
  'Aston Villa': ['Aston Villa FC'],
  Bournemouth: ['AFC Bournemouth'],
  Brentford: ['Brentford FC'],
  Brighton: ['Brighton & Hove Albion FC'],
  Burnley: ['Burnley FC'],
  Chelsea: ['Chelsea FC'],
  Coventry: ['Coventry City FC'],
  'Crystal Palace': ['Crystal Palace FC'],
  Everton: ['Everton FC'],
  Fulham: ['Fulham FC'],
  Hull: ['Hull City AFC'],
  Ipswich: ['Ipswich Town FC'],
  Leeds: ['Leeds United FC'],
  Leicester: ['Leicester City FC'],
  Liverpool: ['Liverpool FC'],
  Luton: ['Luton Town FC'],
  'Manchester City': ['Man City', 'Manchester City FC'],
  'Manchester United': ['Man United', 'Manchester United FC'],
  Newcastle: ['Newcastle United FC'],
  'Nottingham Forest': ["Nott'm Forest", 'Nottingham Forest FC'],
  'Sheffield United': ['Sheffield United FC'],
  Southampton: ['Southampton FC'],
  Sunderland: ['Sunderland AFC'],
  Tottenham: ['Tottenham Hotspur FC'],
  Watford: ['Watford FC'],
  'West Brom': ['West Bromwich Albion FC'],
  'West Ham': ['West Ham United FC'],
  Wolves: ['Wolverhampton Wanderers FC'],
  Norwich: ['Norwich City FC'],
};
export function freeTeam(name: string): Team {
  const canonical = Object.keys(aliases).find((k) => k === name || aliases[k].includes(name));
  if (!canonical)
    throw new ServiceError(
      'SOURCE_TEAM_UNKNOWN',
      'Een teamnaam in de gratis bron is nog niet gekoppeld. De import is gestopt om dubbele teams te voorkomen.',
    );
  const slug = canonical.toLowerCase().replaceAll(' ', '-');
  return {
    id: `free-team-${slug}`,
    name: canonical,
    shortName: canonical.replaceAll(' ', '').slice(0, 3).toUpperCase(),
    logo: clubLogo(canonical),
    color: '#65766c',
    refs: [{ provider: FREE_PROVIDER, externalId: slug }],
  };
}
export const freeLeague: League = {
  id: 'free-league-e0',
  name: 'Premier League',
  country: 'Engeland',
  logo: null,
  refs: [{ provider: FREE_PROVIDER, externalId: 'E0' }],
};
export function fixtureKey(year: number, home: Team, away: Team) {
  return `${year}-${home.refs[0].externalId}-vs-${away.refs[0].externalId}`;
}
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d);
/** Both feeds publish English fixtures in UK local time. Date-only fixtures retain unknown time. */
export function londonKickoff(
  date: string,
  time?: string,
): { kickoff: string; kickoffKnown: boolean } {
  isoDay.parse(date);
  if (!time?.trim()) return { kickoff: `${date}T00:00:00.000Z`, kickoffKnown: false };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new ServiceError('SOURCE_FORMAT_CHANGED', 'Een bron bevat een ongeldige aftraptijd.');
  const desired = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let guess = desired;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const represented = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    guess += desired - represented;
  }
  return { kickoff: new Date(guess).toISOString(), kickoffKnown: true };
}
function baseFixture(
  year: number,
  homeName: string,
  awayName: string,
  date: string,
  time: string | undefined,
  stamp: SourceStamp,
): Fixture {
  const home = freeTeam(homeName),
    away = freeTeam(awayName),
    key = fixtureKey(year, home, away);
  return {
    id: `free-fixture-${key}`,
    refs: [
      { provider: FREE_PROVIDER, externalId: key },
      { provider: stamp.name, externalId: key },
    ],
    league: freeLeague,
    home,
    away,
    sourceDate: date,
    ...londonKickoff(date, time),
    venue: null,
    status: 'scheduled',
    homeGoals: null,
    awayGoals: null,
    halfHomeGoals: null,
    halfAwayGoals: null,
    statistics: null,
    provenance: { sources: [stamp], fields: { kickoff: stamp.name }, conflicts: [] },
  };
}
const resultPair = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const scheduleSchema = z.object({
  matches: z.array(
    z.object({
      date: isoDay,
      time: z.string().optional(),
      team1: z.string(),
      team2: z.string(),
      score: z
        .union([
          z.object({ ft: resultPair.optional(), ht: resultPair.optional() }),
          resultPair.transform((ft) => ({ ft, ht: undefined })),
        ])
        .optional(),
    }),
  ),
});
export function normalizeSchedule(document: SourceDocument, year: number, url: string): Fixture[] {
  let raw: z.infer<typeof scheduleSchema>;
  try {
    raw = scheduleSchema.parse(JSON.parse(document.text));
  } catch {
    throw new ServiceError(
      'SOURCE_FORMAT_CHANGED',
      'Het OpenFootball-bestand heeft een onbekend formaat.',
    );
  }
  return raw.matches.map((m) => {
    const f = baseFixture(year, m.team1, m.team2, m.date, m.time, {
      name: 'openfootball',
      url,
      fetchedAt: document.fetchedAt,
    });
    if (m.score?.ft) {
      [f.homeGoals, f.awayGoals] = m.score.ft;
      f.status = 'finished';
      f.provenance!.fields.score = 'openfootball';
    }
    if (m.score?.ht) {
      [f.halfHomeGoals, f.halfAwayGoals] = m.score.ht;
      f.provenance!.fields.halfTime = 'openfootball';
    }
    return f;
  });
}
function csvNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim()))
    throw new ServiceError(
      'SOURCE_FORMAT_CHANGED',
      'Een CSV-statistiek bevat een ongeldige waarde.',
    );
  return Number(value);
}
export function normalizeCsv(
  document: SourceDocument,
  year: number,
  url: string,
  upcoming = false,
): Fixture[] {
  let rows: Record<string, string>[];
  let columns: string[] = [];
  try {
    rows = parse(document.text, {
      columns: (headers: string[]) => {
        columns = headers;
        return headers;
      },
      bom: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ServiceError('SOURCE_FORMAT_CHANGED', 'Het CSV-bestand heeft een onbekend formaat.');
  }
  if (
    !['Div', 'Date', 'HomeTeam', 'AwayTeam', ...(upcoming ? [] : ['FTHG', 'FTAG'])].every((k) =>
      columns.includes(k),
    )
  )
    throw new ServiceError(
      'SOURCE_FORMAT_CHANGED',
      'Vereiste kolommen ontbreken in het CSV-bestand.',
    );
  const output: Fixture[] = [];
  for (const r of rows) {
    if (r.Div !== 'E0') continue;
    const date = r.Date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!date)
      throw new ServiceError('SOURCE_FORMAT_CHANGED', 'Een CSV-wedstrijddatum is ongeldig.');
    const day = `${date[3]}-${date[2]}-${date[1]}`;
    // The rolling fixtures CSV includes whatever season is current; never attach it to another season.
    if (upcoming && Number(date[3]) - (Number(date[2]) < 7 ? 1 : 0) !== year) continue;
    const f = baseFixture(year, r.HomeTeam, r.AwayTeam, day, r.Time, {
      name: CSV_PROVIDER,
      url,
      fetchedAt: document.fetchedAt,
    });
    f.homeGoals = csvNumber(r.FTHG);
    f.awayGoals = csvNumber(r.FTAG);
    f.halfHomeGoals = csvNumber(r.HTHG);
    f.halfAwayGoals = csvNumber(r.HTAG);
    if (f.homeGoals !== null && f.awayGoals !== null) {
      f.status = 'finished';
      f.provenance!.fields.score = CSV_PROVIDER;
    }
    if (f.halfHomeGoals !== null && f.halfAwayGoals !== null)
      f.provenance!.fields.halfTime = CSV_PROVIDER;
    if (!upcoming) {
      const metrics: {
        home: ReturnType<typeof emptyMetrics>;
        away: ReturnType<typeof emptyMetrics>;
      } = { home: emptyMetrics(), away: emptyMetrics() };
      const columns: Partial<Record<Metric, string>> = {
        shots: 'S',
        shotsOnTarget: 'ST',
        corners: 'C',
        fouls: 'F',
        yellowCards: 'Y',
        redCards: 'R',
      };
      for (const [metric, column] of Object.entries(columns))
        for (const [side, prefix] of [
          ['home', 'H'],
          ['away', 'A'],
        ] as const)
          metrics[side][metric as Metric] = csvNumber(r[prefix + column]);
      if (
        Object.values(metrics.home).some((v) => v !== null) ||
        Object.values(metrics.away).some((v) => v !== null)
      ) {
        f.statistics = metrics;
        f.provenance!.fields.statistics = CSV_PROVIDER;
      }
    }
    output.push(f);
  }
  return output;
}
/** Match by season + ordered canonical teams, so reschedules never create a second match. */
export function mergeFixtures(
  schedule: Fixture[],
  results: Fixture[],
  upcoming: Fixture[],
): Fixture[] {
  const map = new Map<string, Fixture>();
  for (const list of [schedule, results, upcoming])
    for (const item of list) {
      const old = map.get(item.id);
      if (!old) {
        map.set(item.id, item);
        continue;
      }
      const conflicts = [...(old.provenance?.conflicts ?? [])];
      if (
        old.sourceDate !== item.sourceDate ||
        (old.kickoffKnown && item.kickoffKnown && old.kickoff !== item.kickoff)
      )
        conflicts.push('Bronnen verschillen over de aftrap; de CSV-datum krijgt voorrang.');
      if (
        old.status === 'finished' &&
        item.status === 'finished' &&
        (old.homeGoals !== item.homeGoals || old.awayGoals !== item.awayGoals)
      )
        conflicts.push(
          'Bronnen verschillen over de eindstand; Football-Data.co.uk krijgt voorrang.',
        );
      if (
        old.halfHomeGoals !== null &&
        item.halfHomeGoals !== null &&
        (old.halfHomeGoals !== item.halfHomeGoals || old.halfAwayGoals !== item.halfAwayGoals)
      )
        conflicts.push(
          'Bronnen verschillen over de ruststand; Football-Data.co.uk krijgt voorrang.',
        );
      // A fixture also present in the upcoming feed must not erase an already known result.
      const preferred = old.status === 'finished' && item.status !== 'finished' ? old : item;
      const score = item.status === 'finished' ? item : old;
      const halftime = item.halfHomeGoals !== null && item.halfAwayGoals !== null ? item : old;
      const statistics = item.statistics ? item : old;
      map.set(item.id, {
        ...preferred,
        status: score.status,
        homeGoals: score.homeGoals,
        awayGoals: score.awayGoals,
        halfHomeGoals: halftime.halfHomeGoals,
        halfAwayGoals: halftime.halfAwayGoals,
        statistics: statistics.statistics,
        refs: [...new Map([...old.refs, ...item.refs].map((r) => [r.provider, r])).values()],
        provenance: {
          sources: [
            ...new Map(
              [...(old.provenance?.sources ?? []), ...(item.provenance?.sources ?? [])].map((s) => [
                s.url,
                s,
              ]),
            ).values(),
          ],
          fields: {
            kickoff: preferred.provenance?.fields.kickoff,
            score: score.provenance?.fields.score,
            halfTime: halftime.provenance?.fields.halfTime,
            statistics: statistics.provenance?.fields.statistics,
          },
          conflicts: [...new Set(conflicts)],
        },
      });
    }
  return [...map.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
export async function downloadSource(url: string): Promise<SourceDocument> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Matchday/1.0 (football statistics importer)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 4_000_000) throw new Error('Response too large');
    return { text, fetchedAt: new Date().toISOString() };
  } catch {
    throw new ServiceError(
      'FREE_SOURCE_UNAVAILABLE',
      'Een gratis databron is tijdelijk niet beschikbaar. Probeer later opnieuw.',
    );
  }
}
export class FreeFootballProvider implements FootballDataProvider {
  readonly name = FREE_PROVIDER;
  get cacheNamespace() {
    return `${this.name}:39:${this.year}`;
  }
  readonly fixtureIdPrefix = 'free-fixture-';
  readonly statisticsProvider = CSV_PROVIDER;
  readonly label = 'OpenFootball + Football-Data.co.uk';
  readonly warnings = [
    'Gratis bronnen worden periodiek bijgewerkt; dit zijn geen livescores.',
    'Historie omvat maximaal vijf Premier League-seizoenen; voor gepromoveerde teams kan minder data beschikbaar zijn.',
    'xG, balbezit, grote kansen, stadion en events zijn niet beschikbaar in deze bronnen.',
  ];
  private documents = new Map<string, { expires: number; value: Promise<SourceDocument> }>();
  constructor(
    private year: number,
    private read: SourceReader = (url) => downloadSource(url),
  ) {}
  private doc(url: string, ttl: number) {
    const cached = this.documents.get(url);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.read(url, ttl).catch((e) => {
      this.documents.delete(url);
      throw e;
    });
    this.documents.set(url, { expires: Date.now() + ttl * 1000, value });
    return value;
  }
  private csvUrl(year: number) {
    return `https://www.football-data.co.uk/mmz4281/${String(year).slice(-2)}${String(year + 1).slice(-2)}/E0.csv`;
  }
  private async results(year: number) {
    const url = this.csvUrl(year);
    return normalizeCsv(await this.doc(url, year === this.year ? 21600 : 2592000), year, url);
  }
  private async season() {
    const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${this.year}-${String(this.year + 1).slice(-2)}/en.1.json`;
    const fixtureUrl = 'https://www.football-data.co.uk/fixtures.csv';
    const [schedule, results, upcoming] = await Promise.all([
      this.doc(url, 21600).then((d) => normalizeSchedule(d, this.year, url)),
      this.results(this.year),
      this.doc(fixtureUrl, 3600).then((d) => normalizeCsv(d, this.year, fixtureUrl, true)),
    ]);
    return mergeFixtures(schedule, results, upcoming);
  }
  private async historical() {
    const sets = await Promise.all(
      Array.from({ length: 5 }, (_, i) => this.results(this.year - i)),
    );
    return mergeFixtures([], sets.flat(), []);
  }
  async leagues() {
    return [freeLeague];
  }
  async fixtures(date: string) {
    return (await this.season()).filter((f) => f.sourceDate === date);
  }
  async fixture(id: string) {
    return (await this.season()).find((f) => f.refs[0].externalId === id) ?? null;
  }
  async matchHistory(home: string, away: string, cutoff: string) {
    const fixtures = before(await this.historical(), cutoff);
    const includes = (f: Fixture, team: string) =>
      f.home.refs[0].externalId === team || f.away.refs[0].externalId === team;
    return {
      homeHistory: fixtures.filter((f) => includes(f, home)).slice(0, 60),
      awayHistory: fixtures.filter((f) => includes(f, away)).slice(0, 60),
      h2h: fixtures.filter((f) => includes(f, home) && includes(f, away)).slice(0, 10),
    };
  }
  async history(team: string, cutoff: string) {
    return before(await this.historical(), cutoff)
      .filter((f) => f.home.refs[0].externalId === team || f.away.refs[0].externalId === team)
      .slice(0, 60);
  }
  async h2h(home: string, away: string, cutoff: string) {
    return before(await this.historical(), cutoff)
      .filter(
        (f) =>
          [home, away].includes(f.home.refs[0].externalId) &&
          [home, away].includes(f.away.refs[0].externalId),
      )
      .slice(0, 10);
  }
  async statistics(fixture: Fixture) {
    return fixture.statistics;
  }
  async events() {
    return [];
  }
}
