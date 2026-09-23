import {
  additionalClubs,
  competitions,
  competitionLeague,
  type Division,
} from '../../src/domain/competitions';
export type { Division } from '../../src/domain/competitions';
import { applyResults } from './espn-results';
import { spanishClubs } from '../../src/domain/spanish-clubs';
import { clubLogo } from '../../src/domain/club-assets';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import {
  before,
  emptyMetrics,
  type Fixture,
  type MatchData,
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
  ...spanishClubs,
  ...additionalClubs,
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
export const spanishLeague: League = {
  id: 'free-league-sp1',
  name: 'La Liga',
  country: 'Spanje',
  logo: null,
  refs: [{ provider: FREE_PROVIDER, externalId: 'SP1' }],
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
  timeZone = 'Europe/London',
): { kickoff: string; kickoffKnown: boolean } {
  isoDay.parse(date);
  if (!time?.trim()) return { kickoff: `${date}T00:00:00.000Z`, kickoffKnown: false };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new ServiceError('SOURCE_FORMAT_CHANGED', 'Een bron bevat een ongeldige aftraptijd.');
  const desired = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
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
  division: Division = 'E0',
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
    league: competitionLeague(division),
    home,
    away,
    sourceDate: date,
    ...londonKickoff(
      date,
      time,
      stamp.name === 'openfootball' ? competitions[division].timezone : 'Europe/London',
    ),
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
export function normalizeSchedule(
  document: SourceDocument,
  year: number,
  url: string,
  division: Division = 'E0',
): Fixture[] {
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
    const f = baseFixture(
      year,
      m.team1,
      m.team2,
      m.date,
      m.time,
      {
        name: 'openfootball',
        url,
        fetchedAt: document.fetchedAt,
      },
      division,
    );
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
  division: Division = 'E0',
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
    if (r.Div !== division) continue;
    const date = r.Date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!date)
      throw new ServiceError('SOURCE_FORMAT_CHANGED', 'Een CSV-wedstrijddatum is ongeldig.');
    const day = `${date[3]}-${date[2]}-${date[1]}`;
    // The rolling fixtures CSV includes whatever season is current; never attach it to another season.
    if (upcoming && Number(date[3]) - (Number(date[2]) < 7 ? 1 : 0) !== year) continue;
    const f = baseFixture(
      year,
      r.HomeTeam,
      r.AwayTeam,
      day,
      r.Time,
      {
        name: CSV_PROVIDER,
        url,
        fetchedAt: document.fetchedAt,
      },
      division,
    );
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
    const signal = AbortSignal.timeout(15000);
    const origin = new URL(url);
    let target = origin;
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(target.href, {
        signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Matchday/1.0 (football statistics importer)' },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location || redirects >= 3) throw new Error('Invalid source redirect');
      const next = new URL(location, target);
      // The source currently redirects to localhost. Never follow it into the server's network.
      if (
        next.protocol !== 'https:' ||
        next.username ||
        next.password ||
        next.hostname.replace(/^www\./, '') !== origin.hostname.replace(/^www\./, '')
      )
        throw new Error('Invalid source redirect');
      target = next;
    }
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
    return `${this.name}:${competitions[this.division].apiId}:${this.year}`;
  }
  readonly fixtureIdPrefix = 'free-fixture-';
  readonly statisticsProvider = CSV_PROVIDER;
  readonly label = 'OpenFootball + Football-Data.co.uk + ESPN-uitslagen';
  readonly warnings = [
    'Gratis bronnen worden periodiek bijgewerkt; dit zijn geen livescores.',
    'Historie omvat maximaal vijf seizoenen in de geselecteerde competitie; voor gepromoveerde teams kan minder data beschikbaar zijn.',
    'xG, grote kansen en events zijn niet beschikbaar; overige statistieken hangen af van de bron.',
  ];
  recentResultChecksFailed = 0;
  private documents = new Map<string, { expires: number; value: Promise<SourceDocument> }>();
  constructor(
    private year: number,
    private read: SourceReader = (url) => downloadSource(url),
    readonly division: Division = 'E0',
  ) {}
  private doc(url: string, ttl: number) {
    const cached = this.documents.get(url);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.read(url, ttl).catch((e) => {
      this.documents.delete(url);
      throw e;
    });
    this.documents.set(url, { expires: Date.now() + Math.min(ttl, 300) * 1000, value });
    return value;
  }
  private csvUrl(year: number) {
    return `https://www.football-data.co.uk/mmz4281/${String(year).slice(-2)}${String(year + 1).slice(-2)}/${this.division}.csv`;
  }
  private async results(year: number) {
    const url = this.csvUrl(year);
    return normalizeCsv(
      await this.doc(url, year === this.year ? 21600 : 2592000),
      year,
      url,
      false,
      this.division,
    );
  }
  async seasonFixtures() {
    this.recentResultChecksFailed = 0;
    const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${this.year}-${String(this.year + 1).slice(-2)}/${competitions[this.division].file}.1.json`;
    const fixtureUrl = 'https://www.football-data.co.uk/fixtures.csv';
    const [schedule, results, upcoming] = await Promise.all([
      this.doc(url, 21600).then((d) => normalizeSchedule(d, this.year, url, this.division)),
      this.results(this.year),
      this.doc(fixtureUrl, 3600).then((d) =>
        normalizeCsv(d, this.year, fixtureUrl, true, this.division),
      ),
    ]);
    let rows = mergeFixtures(schedule, results, upcoming);
    // Recent final scores may reach ESPN before the periodic CSV. Never query bookmaker odds here.
    const now = Date.now();
    const dates = [
      ...new Set(
        rows
          .filter(
            (f) =>
              Date.parse(f.kickoff) < now &&
              Date.parse(f.kickoff) > now - 7 * 86400000 &&
              (f.status !== 'finished' || !f.statistics),
          )
          .map((f) => f.sourceDate!),
      ),
    ];
    for (let i = 0; i < dates.length; i += 2) {
      const batch = await Promise.allSettled(
        dates.slice(i, i + 2).map(async (date) => {
          const url = `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${competitions[this.division].espn}/scoreboard?dates=${date.replaceAll('-', '')}&limit=100`;
          const doc = await this.doc(url, 300);
          return { date, url, doc };
        }),
      );
      for (const item of batch) {
        if (item.status === 'rejected') {
          this.recentResultChecksFailed++;
          console.warn('Recent result source unavailable', { division: this.division });
        }
        if (item.status === 'fulfilled') {
          const { date, url, doc } = item.value;
          try {
            const updated = applyResults(
              rows.filter((f) => f.sourceDate === date),
              JSON.parse(doc.text),
              url,
              doc.fetchedAt,
            );
            const map = new Map(updated.map((f) => [f.id, f]));
            rows = rows.map((f) => map.get(f.id) ?? f);
          } catch {
            this.recentResultChecksFailed++;
            console.warn('Recent result source could not be normalized', {
              division: this.division,
              date,
            });
          }
        }
      }
    }
    return rows;
  }
  private async historical(season?: Fixture[]) {
    const sets = await Promise.all(
      Array.from({ length: 5 }, (_, i) => this.results(this.year - i)),
    );
    return mergeFixtures(
      [],
      [
        ...sets.flat(),
        ...(season ?? (await this.seasonFixtures())).filter((f) => f.status === 'finished'),
      ],
      [],
    );
  }
  async leagues() {
    return [competitionLeague(this.division)];
  }
  async fixtures(date: string) {
    return (await this.seasonFixtures()).filter((f) => f.sourceDate === date);
  }
  async fixture(id: string) {
    return (await this.seasonFixtures()).find((f) => f.refs[0].externalId === id) ?? null;
  }
  async previewData(date: string): Promise<MatchData[]> {
    return this.previewRange(date, 1);
  }
  async previewRange(date: string, days: number): Promise<MatchData[]> {
    const end = new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
    const season = await this.seasonFixtures();
    const fixtures = season.filter((f) => f.sourceDate! >= date && f.sourceDate! < end);
    if (!fixtures.length) return [];
    const history = await this.historical(season);
    return fixtures.map((fixture) => {
      const rows = before(history, fixture.kickoff);
      const includes = (f: Fixture, id: string) => f.home.id === id || f.away.id === id;
      return {
        fixture,
        homeHistory: rows.filter((f) => includes(f, fixture.home.id)).slice(0, 60),
        awayHistory: rows.filter((f) => includes(f, fixture.away.id)).slice(0, 60),
        h2h: rows
          .filter((f) => includes(f, fixture.home.id) && includes(f, fixture.away.id))
          .slice(0, 10),
        source: 'live',
        sourceLabel: this.label,
        updatedAt: new Date().toISOString(),
        warnings: this.warnings,
      };
    });
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
