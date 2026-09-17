import { z } from 'zod';
import { canonicalClubName } from '../../src/domain/club-names';
import { competitionLeague, competitions, type Division } from '../../src/domain/competitions';
import type { Fixture } from '../../src/domain/models';
import { ServiceError } from '../errors';
import { fixtureKey, freeTeam, type SourceDocument } from './free-football';

export const orgCodes = { E0: 'PL', SP1: 'PD', I1: 'SA', F1: 'FL1' } as const;
const score = z.object({
  home: z.number().int().nonnegative().nullable(),
  away: z.number().int().nonnegative().nullable(),
});
const payloadSchema = z.object({
  matches: z.array(
    z.object({
      id: z.number().int(),
      utcDate: z.string().datetime(),
      competition: z.object({ code: z.string() }),
      season: z.object({ startDate: z.string() }),
      status: z.enum([
        'SCHEDULED',
        'TIMED',
        'IN_PLAY',
        'PAUSED',
        'FINISHED',
        'SUSPENDED',
        'POSTPONED',
        'CANCELLED',
        'AWARDED',
      ]),
      homeTeam: z.object({ name: z.string() }),
      awayTeam: z.object({ name: z.string() }),
      score: z.object({
        fullTime: score,
        halfTime: score.optional(),
        duration: z.string().optional(),
      }),
    }),
  ),
});
export function orgUrl(year: number, division: Division) {
  return `https://api.football-data.org/v4/competitions/${orgCodes[division]}/matches?season=${year}`;
}
export function normalizeOrg(doc: SourceDocument, year: number, division: Division): Fixture[] {
  const parsed = payloadSchema.safeParse(JSON.parse(doc.text));
  if (!parsed.success)
    throw new ServiceError(
      'ORG_FORMAT_CHANGED',
      'De alternatieve databron heeft een onbekend formaat.',
    );
  return parsed.data.matches.map((m) => {
    if (
      m.competition.code !== orgCodes[division] ||
      Number(m.season.startDate.slice(0, 4)) !== year
    )
      throw new ServiceError(
        'ORG_FORMAT_CHANGED',
        'De alternatieve databron bevat een andere competitie of een ander seizoen.',
      );
    const home = freeTeam(canonicalClubName(m.homeTeam.name) ?? m.homeTeam.name);
    const away = freeTeam(canonicalClubName(m.awayTeam.name) ?? m.awayTeam.name);
    const key = fixtureKey(year, home, away);
    const status: Fixture['status'] =
      m.status === 'FINISHED'
        ? 'finished'
        : ['IN_PLAY', 'PAUSED'].includes(m.status)
          ? 'live'
          : ['POSTPONED', 'SUSPENDED'].includes(m.status)
            ? 'postponed'
            : ['CANCELLED', 'AWARDED'].includes(m.status)
              ? 'cancelled'
              : 'scheduled';
    const observed = status === 'finished' || status === 'live';
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: competitions[division].timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date(m.utcDate))
        .map((p) => [p.type, p.value]),
    );
    return {
      id: `free-fixture-${key}`,
      refs: [
        { provider: 'free-football', externalId: key },
        { provider: 'football-data-org', externalId: String(m.id) },
      ],
      league: competitionLeague(division),
      home,
      away,
      kickoff: m.utcDate,
      kickoffKnown: m.status !== 'SCHEDULED',
      sourceDate: `${parts.year}-${parts.month}-${parts.day}`,
      venue: null,
      status,
      homeGoals: observed ? m.score.fullTime.home : null,
      awayGoals: observed ? m.score.fullTime.away : null,
      halfHomeGoals: observed ? (m.score.halfTime?.home ?? null) : null,
      halfAwayGoals: observed ? (m.score.halfTime?.away ?? null) : null,
      statistics: null,
      availability: { status: 'fallback', source: 'Football-data.org', updatedAt: doc.fetchedAt },
      provenance: {
        sources: [
          { name: 'football-data-org', url: orgUrl(year, division), fetchedAt: doc.fetchedAt },
        ],
        fields: {
          kickoff: 'football-data-org',
          ...(observed ? { score: 'football-data-org', halfTime: 'football-data-org' } : {}),
        },
        conflicts: [],
      },
    };
  });
}
export async function downloadOrg(url: string, key: string): Promise<SourceDocument> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-Auth-Token': key },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ServiceError(
      'ORG_UNAVAILABLE',
      'De alternatieve databron is tijdelijk niet bereikbaar.',
    );
  }
  if (!response.ok)
    throw new ServiceError(
      response.status === 429
        ? 'ORG_RATE_LIMIT'
        : [401, 403].includes(response.status)
          ? 'ORG_AUTH_FAILED'
          : 'ORG_UNAVAILABLE',
      'De alternatieve databron kan momenteel geen gegevens leveren.',
    );
  return { text: await response.text(), fetchedAt: new Date().toISOString() };
}
