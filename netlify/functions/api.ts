import type { Context } from '@netlify/functions';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
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
  const { API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!API_FOOTBALL_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Server configuration missing');
  service = new FootballService(
    new ApiFootballProvider(
      API_FOOTBALL_KEY,
      process.env.SUPPORTED_LEAGUE_ID,
      process.env.FOOTBALL_SEASON,
    ),
    new Repository(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  );
  return service;
}
export default async function handler(request: Request, context: Context) {
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
      if (
        !(await svc.repo.rateLimit(`${isSync ? 'sync' : 'read'}:${bucket}`, isSync ? 5 : 60, 60)) ||
        !(await svc.repo.rateLimit('global:api', 300, 60))
      )
        return json({ error: 'Te veel verzoeken. Probeer later opnieuw.' }, 429);
    }
    if (path[0] === 'leagues' && path.length === 1)
      return json(demo ? [demoLeague] : await svc!.leagues());
    if (path[0] === 'fixtures' && path.length === 1) {
      const date = dateSchema.parse(url.searchParams.get('date') ?? today());
      return json(demo ? demoFixtures(date) : await svc!.fixtures(date));
    }
    if (path[0] === 'match' && path.length >= 2 && path.length <= 3) {
      const id = idSchema.parse(path[1]);
      if (path[2] && !['analysis', 'h2h'].includes(path[2]))
        return json({ error: 'Niet gevonden' }, 404);
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
    if (error instanceof BusyError) return json({ error: error.message }, 503);
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
