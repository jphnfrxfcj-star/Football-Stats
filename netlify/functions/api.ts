import { MultiLeagueProvider } from '../../server/providers/multi-league';
import { buildMarkets } from '../../src/analysis/combinations';
import { getOdds } from '../../server/providers/odds';
import { canonicalClubName } from '../../src/domain/club-names';
import { playerReport } from '../../server/providers/espn-players';
import { buildSpotlight } from '../../src/analysis/spotlight';
import type { Context } from '@netlify/functions';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { ServiceError } from '../../server/errors';
import { serverConfig } from '../../server/config';
import { downloadSource } from '../../server/providers/free-football';
import { ApiFootballProvider } from '../../server/providers/api-football';
import { Repository } from '../../server/repositories/supabase';
import { BusyError, FootballService } from '../../server/service';
import { demoFixtures, demoLeague, demoMatch, today } from '../../src/demo/data';
import { analyze, summarize } from '../../src/analysis/engine';
import { probabilities } from '../../src/analysis/probability';
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d,
    'Invalid date',
  );
const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9-]+$/);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 503 ? { 'Retry-After': '5' } : {}),
    },
  });
let service: FootballService | undefined;
function getService() {
  if (service) return service;
  const config = serverConfig();
  const repository = new Repository(config.supabaseUrl, config.supabaseKey);
  const provider =
    config.provider === 'free-football'
      ? new MultiLeagueProvider(config.season, (url, ttl) =>
          service!.cached(`free-football:source:v1:${url}`, ttl, () => downloadSource(url)),
        )
      : new ApiFootballProvider(
          config.apiKey,
          process.env.SUPPORTED_LEAGUE_ID,
          String(config.season),
        );
  service = new FootballService(provider, repository);
  return service;
}
async function route(request: Request, context: Context) {
  try {
    const url = new URL(request.url);
    const path = url.pathname
      .replace(/^\/(?:api|\.netlify\/functions\/api)\/?/, '')
      .split('/')
      .filter(Boolean);
    const isSync = path[0] === 'sync';
    if (request.method !== (isSync ? 'POST' : 'GET'))
      return json({ error: 'Methode niet toegestaan' }, 405);
    if (isSync) {
      const expected = process.env.SYNC_SECRET,
        provided = request.headers.get('authorization')?.replace(/^Bearer /, '');
      if (
        !expected ||
        !provided ||
        !timingSafeEqual(
          createHash('sha256').update(expected).digest(),
          createHash('sha256').update(provided).digest(),
        )
      )
        return json({ error: 'Niet geautoriseerd' }, 401);
    }
    const demo = process.env.DEMO_MODE !== 'false';
    const svc = demo ? null : getService();
    if (svc) {
      const ip = context.ip ?? 'unknown';
      const bucket = createHash('sha256').update(ip).digest('hex');
      const allowed = await Promise.all([
        svc.repo.rateLimit(`${isSync ? 'sync' : 'read'}:${bucket}`, isSync ? 5 : 60, 60),
        svc.repo.rateLimit('global:api', 300, 60),
      ]);
      if (allowed.some((value) => !value))
        return json({ error: 'Te veel verzoeken. Probeer later opnieuw.' }, 429);
    }
    if (path[0] === 'leagues' && path.length === 1)
      return json(demo ? [demoLeague] : await svc!.leagues());
    if (path[0] === 'markets' && path.length === 1) {
      const date = dateSchema.parse(url.searchParams.get('date') ?? today());
      const window = z.coerce
        .number()
        .refine((n) => [5, 10, 20].includes(n))
        .parse(url.searchParams.get('window') ?? 5);
      if (!demo) return json(await svc!.markets(date, window));
      return json(
        buildMarkets(
          demoFixtures(date).map((f) => ({ ...demoMatch(f.id)!, fixture: f })),
          {
            source: 'Demo',
            kind: 'snapshot',
            fetchedAt: new Date().toISOString(),
            quotes: [],
            message: 'Fictieve wedstrijdhistorie. Geen bookmakerodds.',
          },
          window,
          Date.parse(`${date}T00:00:00Z`),
        ),
      );
    }
    if (path[0] === 'spotlight' && path.length === 1) {
      const date = dateSchema.parse(url.searchParams.get('date') ?? today());
      if (!demo) return json(await svc!.spotlight(date));
      const matches = demoFixtures(date).map((fixture) => {
        const data = demoMatch(fixture.id)!;
        const analysis = analyze(data);
        return {
          fixture,
          probabilities: probabilities(data, analysis),
          homeSamples: analysis.home[2].available,
          awaySamples: analysis.away[2].available,
        };
      });
      return json(
        buildSpotlight(
          matches,
          {
            source: 'Demo',
            kind: 'snapshot',
            fetchedAt: new Date().toISOString(),
            quotes: [],
            message: 'Voorbeeld van modelkansen op fictieve wedstrijden. Geen bookmakerodds.',
          },
          Date.parse(`${date}T00:00:00Z`),
        ),
      );
    }
    if (path[0] === 'fixtures' && path.length === 1) {
      const date = dateSchema.parse(url.searchParams.get('date') ?? today());
      return json(demo ? demoFixtures(date) : await svc!.fixtures(date));
    }
    if (path[0] === 'match' && path.length >= 2 && path.length <= 3) {
      const id = idSchema.parse(path[1]);
      if (path[2] && !['analysis', 'h2h', 'players', 'odds'].includes(path[2]))
        return json({ error: 'Niet gevonden' }, 404);
      if (path[2] === 'odds') {
        if (demo)
          return json({
            source: 'Demo',
            kind: 'snapshot',
            fetchedAt: new Date().toISOString(),
            quotes: [],
            message: 'De demo bevat geen bookmakerodds.',
          });
        const fixture = await svc!.fixture(id);
        if (!fixture) return json({ error: 'Wedstrijd niet gevonden' }, 404);
        if (
          fixture.status !== 'scheduled' ||
          fixture.kickoffKnown === false ||
          Date.parse(fixture.kickoff) <= Date.now()
        )
          return json({
            source: 'Geen pre-matchodds',
            kind: 'snapshot',
            fetchedAt: new Date().toISOString(),
            quotes: [],
            message:
              'Deze vergelijking is alleen beschikbaar vóór een bekende aftrap. In-playodds vereisen een afzonderlijk live model.',
          });
        const odds = await getOdds(svc!);
        return json({
          ...odds,
          quotes: odds.quotes.filter(
            (q) =>
              q.home === canonicalClubName(fixture.home.name) &&
              q.away === canonicalClubName(fixture.away.name) &&
              q.date === (fixture.sourceDate ?? fixture.kickoff.slice(0, 10)) &&
              (q.kickoff === null ||
                Math.abs(Date.parse(q.kickoff) - Date.parse(fixture.kickoff)) <= 60000),
          ),
        });
      }
      if (path[2] === 'players') {
        if (demo)
          return json({
            source: 'Demo',
            fetchedAt: new Date().toISOString(),
            teams: [],
            matches: [],
            warnings: [
              'Spelergegevens zijn beschikbaar bij echte wedstrijden; de demo bevat geen verzonnen spelers.',
            ],
          });
        const result = await svc!.analysis(id);
        if (!result) return json({ error: 'Wedstrijd niet gevonden' }, 404);
        return json(
          await svc!.cached(
            `players-report:v2:${svc!.provider.cacheNamespace ?? svc!.provider.name}:${id}:${result.data.fixture.kickoff}`,
            300,
            () => playerReport(result.data, svc!),
          ),
        );
      }
      if (path[2] === 'analysis') {
        const data = demo ? demoMatch(id) : null;
        const result = demo
          ? data
            ? { data, analysis: analyze(data), probabilities: probabilities(data) }
            : null
          : await svc!.analysis(id);
        return result ? json(result) : json({ error: 'Wedstrijd niet gevonden' }, 404);
      }
      const fixture = demo ? demoMatch(id)?.fixture : await svc!.fixture(id);
      if (!fixture) return json({ error: 'Wedstrijd niet gevonden' }, 404);
      return json(
        path[2] === 'h2h' ? (demo ? demoMatch(id)!.h2h : await svc!.h2h(fixture)) : fixture,
      );
    }
    if (path[0] === 'team' && path.length === 3 && ['form', 'home-away'].includes(path[2])) {
      const id = idSchema.parse(path[1]),
        cutoff = dateSchema.parse(url.searchParams.get('before') ?? today());
      const team = demo ? null : await svc!.repo.team(id);
      if (!team) return json({ error: 'Team niet gevonden; open eerst een wedstrijd.' }, 404);
      const history = await svc!.history(team, `${cutoff}T00:00:00Z`);
      return json(
        path[2] === 'form'
          ? [5, 10, 20].map((n) => summarize(history, id, n))
          : {
              home: [5, 10, 20].map((n) => summarize(history, id, n, 'home')),
              away: [5, 10, 20].map((n) => summarize(history, id, n, 'away')),
            },
      );
    }
    if (isSync && path[1] === 'fixture' && path.length === 3) {
      const id = idSchema.parse(path[2]);
      if (demo) return json({ error: 'Synchronisatie is alleen beschikbaar in live-modus' }, 409);
      const result = await svc!.sync(id);
      return result ? json(result) : json({ error: 'Wedstrijd niet gevonden' }, 404);
    }
    return json({ error: 'Endpoint niet gevonden' }, 404);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: 'Ongeldige API-parameters' }, 400);
    if (error instanceof BusyError) return json({ error: error.message, code: 'SYNC_BUSY' }, 503);
    if (error instanceof ServiceError) {
      console.error('API request failed', error.code);
      return json({ error: error.message, code: error.code }, 503);
    }
    console.error('API request failed', error instanceof Error ? error.message : 'Unknown error');
    return json(
      {
        error:
          'Gegevens zijn tijdelijk niet beschikbaar. Controleer de serverconfiguratie of probeer later opnieuw.',
      },
      503,
    );
  }
}

// Only successful public reads are shared. Errors and authenticated writes remain no-store.
export default async function handler(request: Request, context: Context) {
  const response = await route(request, context);
  if (
    request.method === 'GET' &&
    response.status === 200 &&
    !request.headers.has('authorization')
  ) {
    response.headers.set('Cache-Control', 'public, max-age=30');
    response.headers.set('Netlify-CDN-Cache-Control', 'public, durable, s-maxage=60');
    response.headers.set('Netlify-Vary', 'query');
  }
  return response;
}
