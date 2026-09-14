import { competitions, fixtureDivision } from '../../src/domain/competitions';
import { z } from 'zod';
import { before, type MatchData, type Fixture } from '../../src/domain/models';
import { canonicalClubName } from '../../src/domain/club-names';
import {
  summarizePlayers,
  type PlayerObservation,
  type PlayerReport,
  type PlayerMetric,
} from '../../src/domain/players';
import { ServiceError } from '../errors';
import type { FootballService } from '../service';
const bases = [
  'https://site.web.api.espn.com/apis/site/v2/sports/soccer/',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/',
];
const team = z.object({ displayName: z.string() });
const competitor = z.object({ homeAway: z.string(), team });
const competition = z.object({
  date: z.string(),
  status: z.object({ type: z.object({ completed: z.boolean() }) }),
  competitors: z.array(competitor),
});
const summary = z.object({
  header: z.object({ id: z.string(), competitions: z.array(competition) }),
  rosters: z
    .array(
      z.object({
        team,
        roster: z.array(
          z.object({
            athlete: z.object({ id: z.string(), displayName: z.string() }),
            starter: z.boolean().optional(),
            stats: z
              .array(z.object({ name: z.string(), value: z.number().nullable().optional() }))
              .optional(),
          }),
        ),
      }),
    )
    .optional(),
});
const names: Record<PlayerMetric, string> = {
  shots: 'totalShots',
  shotsOnTarget: 'shotsOnTarget',
  foulsCommitted: 'foulsCommitted',
  foulsSuffered: 'foulsSuffered',
  goals: 'totalGoals',
  assists: 'goalAssists',
  yellowCards: 'yellowCards',
  redCards: 'redCards',
};
export function normalizePlayerSummary(raw: unknown): {
  eventId: string;
  home: string | null;
  away: string | null;
  kickoff: string;
  observations: PlayerObservation[];
} {
  const data = summary.parse(raw),
    game = data.header.competitions[0];
  if (!game || !game.status.type.completed) throw new Error('Player match is not complete');
  const observations: PlayerObservation[] = [];
  for (const roster of data.rosters ?? []) {
    const club = canonicalClubName(roster.team.displayName);
    if (!club) continue;
    for (const player of roster.roster) {
      const stats = new Map((player.stats ?? []).map((s) => [s.name, s.value]));
      // Bench players and missing participation data must not become zero-shot appearances.
      if (!(Number(stats.get('appearances')) > 0)) continue;
      observations.push({
        eventId: data.header.id,
        kickoff: game.date,
        team: club,
        playerId: player.athlete.id,
        name: player.athlete.displayName,
        starter: player.starter ?? null,
        sourceUrl: `https://www.espn.com/soccer/matchstats/_/gameId/${data.header.id}`,
        metrics: Object.fromEntries(
          Object.entries(names).map(([key, name]) => {
            const v = stats.get(name);
            return [key, typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null];
          }),
        ) as PlayerObservation['metrics'],
      });
    }
  }
  const club = (side: string) =>
    canonicalClubName(game.competitors.find((c) => c.homeAway === side)?.team.displayName ?? '');
  return {
    eventId: data.header.id,
    home: club('home'),
    away: club('away'),
    kickoff: game.date,
    observations,
  };
}
export async function readPlayerSource(path: string, league = 'eng.1'): Promise<unknown> {
  let status: number | undefined;
  for (const base of bases) {
    try {
      const r = await fetch(base + league + '/' + path, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Matchday/1.0' },
      });
      if (r.ok) return await r.json();
      status = r.status;
      await r.body?.cancel();
      console.warn('Player source HTTP failure', { host: new URL(base).hostname, league, status });
    } catch {
      // Both are public ESPN data endpoints; no cookies, credentials or proxy involved.
    }
  }
  throw new ServiceError(
    'PLAYER_SOURCE_UNAVAILABLE',
    status
      ? `De spelerbron is niet bereikbaar vanaf de server (HTTP ${status}).`
      : 'De bron voor spelerstatistieken is tijdelijk niet beschikbaar.',
  );
}
export async function playerReport(
  data: MatchData,
  service: FootballService,
): Promise<PlayerReport> {
  const league = competitions[fixtureDivision(data.fixture)].espn;
  const cutoff = Date.parse(data.fixture.kickoff);
  const teams = [data.fixture.home, data.fixture.away];
  const histories = [data.homeHistory, data.awayHistory].map((rows, i) =>
    before(rows, data.fixture.kickoff)
      .filter((f) => f.home.id === teams[i].id || f.away.id === teams[i].id)
      .slice(0, 5),
  );
  const games = [...new Map(histories.flat().map((f) => [f.id, f])).values()];
  const observations: PlayerObservation[] = [],
    warnings: string[] = [];
  const byFixture = new Map<string, PlayerObservation[]>();
  async function collect(f: Fixture) {
    try {
      const date = (f.sourceDate ?? f.kickoff.slice(0, 10)).replaceAll('-', '');
      const events = await service.cached(
        `espn:scoreboard:v2:${league}:${date}`,
        86400,
        async () => {
          const parsed = z
            .object({
              events: z.array(
                z.object({ id: z.string().regex(/^\d+$/), competitions: z.array(competition) }),
              ),
            })
            .parse(await readPlayerSource(`scoreboard?dates=${date}&limit=100`, league));
          return parsed.events;
        },
      );
      const home = canonicalClubName(f.home.name),
        away = canonicalClubName(f.away.name);
      const event = events.find((e) =>
        e.competitions.some(
          (c) =>
            c.competitors.some(
              (t) => t.homeAway === 'home' && canonicalClubName(t.team.displayName) === home,
            ) &&
            c.competitors.some(
              (t) => t.homeAway === 'away' && canonicalClubName(t.team.displayName) === away,
            ),
        ),
      );
      if (!home || !away || !event) throw new Error('Match not mapped');
      const result = await service.cached(`espn:players:v3:${event.id}`, 2592000, async () => {
        const normalized = normalizePlayerSummary(
          await readPlayerSource(`summary?event=${event.id}`, league),
        );
        if (!normalized.observations.length) throw new Error('No observations');
        return normalized;
      });
      if (
        result.eventId !== event.id ||
        result.home !== home ||
        result.away !== away ||
        !(Date.parse(result.kickoff) < cutoff) ||
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(result.kickoff)) !== (f.sourceDate ?? f.kickoff.slice(0, 10))
      )
        throw new Error('Source mismatch');
      if (!result.observations.length) throw new Error('No observations');
      if (result.observations.length) {
        byFixture.set(f.id, result.observations);
        observations.push(...result.observations);
      }
    } catch (error) {
      const reason =
        error instanceof ServiceError
          ? error.message
          : error instanceof z.ZodError
            ? 'De brongegevens hebben een onverwacht formaat.'
            : error instanceof Error && error.message === 'Match not mapped'
              ? 'Geen overeenkomende wedstrijd bij de bron.'
              : error instanceof Error && error.message === 'No observations'
                ? 'De bron levert geen bevestigde spelersoptredens.'
                : error instanceof Error && error.message === 'Source mismatch'
                  ? 'Wedstrijddatum of teams komen niet overeen.'
                  : 'Het ophalen van deze wedstrijd is niet gelukt.';
      warnings.push(
        `Geen spelergegevens voor ${f.home.name} – ${f.away.name} (${f.sourceDate ?? f.kickoff.slice(0, 10)}). ${reason}`,
      );
    }
  }
  // At most two upstream matches in flight; cached observations are shared by every visitor.
  for (let i = 0; i < games.length; i += 2) await Promise.all(games.slice(i, i + 2).map(collect));
  return {
    source: 'ESPN',
    fetchedAt: new Date().toISOString(),
    warnings,
    teams: [data.fixture.home, data.fixture.away].map((t, i) => ({
      name: t.name,
      requested: histories[i].length,
      available: histories[i].filter((f) =>
        byFixture.get(f.id)?.some((o) => o.team === canonicalClubName(t.name)),
      ).length,
      players: summarizePlayers(
        histories[i]
          .flatMap((f) => byFixture.get(f.id) ?? [])
          .filter((o) => o.team === canonicalClubName(t.name)),
      ),
    })),
    matches: [
      ...new Map(
        observations.map((o) => [
          o.eventId,
          { id: o.eventId, kickoff: o.kickoff, sourceUrl: o.sourceUrl },
        ]),
      ).values(),
    ],
  };
}
