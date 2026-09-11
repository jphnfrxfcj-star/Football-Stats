import { FreeFootballProvider } from '../server/providers/free-football';
import { FootballService } from '../server/service';
import { Repository } from '../server/repositories/supabase';
import { analyze } from '../src/analysis/engine';
const date = process.argv[2] ?? '2026-09-12';
const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
const provider = new FreeFootballProvider(year);
const fixtures = await provider.fixtures(date);
if (!fixtures.length) throw new Error(`No fixtures on ${date}; choose a match day.`);
const fixture = fixtures[0];
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const service = new FootballService(
    provider,
    new Repository(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  await service.fixtures(date);
  const result = await service.analysis(fixture.id);
  if (!result) throw new Error('Persisted analysis missing');
  console.log(
    JSON.stringify(
      {
        mode: 'supabase',
        id: fixture.id,
        fixtures: fixtures.length,
        home: result.analysis.home[2].available,
        away: result.analysis.away[2].available,
        h2h: result.analysis.h2h[1].available,
        statistics: result.data.homeHistory.filter((f) => f.statistics).length,
        conflicts: result.data.warnings,
        source: result.data.sourceLabel,
      },
      null,
      2,
    ),
  );
} else {
  const homeHistory = await provider.history(fixture.home.refs[0].externalId, fixture.kickoff),
    awayHistory = await provider.history(fixture.away.refs[0].externalId, fixture.kickoff),
    h2h = await provider.h2h(
      fixture.home.refs[0].externalId,
      fixture.away.refs[0].externalId,
      fixture.kickoff,
    );
  const result = analyze({
    fixture,
    homeHistory,
    awayHistory,
    h2h,
    source: 'live',
    updatedAt: new Date().toISOString(),
    warnings: [],
  });
  console.log(
    JSON.stringify(
      {
        mode: 'sources',
        id: fixture.id,
        fixtures: fixtures.length,
        home: result.home[2].available,
        away: result.away[2].available,
        h2h: result.h2h[1].available,
        statistics: homeHistory.filter((f) => f.statistics).length,
      },
      null,
      2,
    ),
  );
}

if (process.env.CHECK_API === 'true') {
  process.env.DEMO_MODE = 'false';
  process.env.FOOTBALL_PROVIDER = 'free-football';
  process.env.FOOTBALL_SEASON = String(year);
  const { default: handler } = await import('../netlify/functions/api');
  for (const path of [`fixtures?date=${date}`, `match/${fixture.id}/analysis`]) {
    const response = await handler(new Request(`http://localhost/api/${path}`), {
      ip: '127.0.0.1',
    } as never);
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    console.log(
      JSON.stringify({
        path,
        status: response.status,
        source: body.data?.sourceLabel ?? 'fixtures',
        count: Array.isArray(body) ? body.length : body.analysis?.home[2].available,
      }),
    );
  }
}
