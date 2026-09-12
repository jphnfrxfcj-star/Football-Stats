import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@netlify/functions';
import handler from '../netlify/functions/api';
const context = { ip: '127.0.0.1' } as Context;
beforeEach(() => vi.stubEnv('DEMO_MODE', 'true'));
afterEach(() => vi.unstubAllEnvs());
describe('API boundary', () => {
  it('returns demo fixtures and a real computed analysis', async () => {
    const list = await handler(
      new Request('http://localhost/api/fixtures?date=2026-09-11'),
      context,
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toHaveLength(4);
    const r = await handler(
      new Request('http://localhost/api/match/demo-2026-09-11-0/analysis'),
      context,
    );
    const body = await r.json();
    expect(body.data.source).toBe('demo');
    expect(body.analysis.home).toHaveLength(3);
    expect(body.probabilities).toHaveLength(7);
  });
  it.each(['2026-02-30', 'invalid', '2026-13-01'])('rejects invalid date %s', async (date) => {
    expect(
      (await handler(new Request(`http://localhost/api/fixtures?date=${date}`), context)).status,
    ).toBe(400);
  });
  it('requires bearer authentication before sync', async () => {
    expect(
      (
        await handler(
          new Request('http://localhost/api/sync/fixture/af-fixture-1', { method: 'POST' }),
          context,
        )
      ).status,
    ).toBe(401);
  });
  it('rejects wrong methods and unknown paths', async () => {
    expect(
      (await handler(new Request('http://localhost/api/fixtures', { method: 'POST' }), context))
        .status,
    ).toBe(405);
    expect(
      (await handler(new Request('http://localhost/api/match/demo-2026-09-11-0/unknown'), context))
        .status,
    ).toBe(404);
  });
});

it('reports missing server settings without returning secret values', async () => {
  vi.stubEnv('DEMO_MODE', 'false');
  vi.stubEnv('API_FOOTBALL_KEY', 'private-test-value');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  const response = await handler(new Request('http://localhost/api/leagues'), context);
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe('SERVER_CONFIG_MISSING');
  expect(body.error).toContain('SUPABASE_URL');
  expect(JSON.stringify(body)).not.toContain('private-test-value');
});

it('caches only successful public GETs and keeps query parameters in the CDN key', async () => {
  const ok = await handler(new Request('http://localhost/api/leagues'), context);
  expect(ok.headers.get('cache-control')).toBe('public, max-age=30');
  expect(ok.headers.get('netlify-cdn-cache-control')).toContain('s-maxage=60');
  expect(ok.headers.get('netlify-vary')).toBe('query');
  for (const request of [
    new Request('http://localhost/api/fixtures?date=invalid'),
    new Request('http://localhost/api/sync/fixture/x', { method: 'POST' }),
    new Request('http://localhost/api/leagues', { headers: { authorization: 'Bearer test' } }),
  ]) {
    const result = await handler(request, context);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('netlify-cdn-cache-control')).toBeNull();
  }
});

it('serves spotlight and explicit empty enrichment in demo mode', async () => {
  const spotlight = await handler(
    new Request('http://localhost/api/spotlight?date=2026-09-12'),
    context,
  );
  const report = await spotlight.json();
  expect(spotlight.status).toBe(200);
  expect(report.cards.length).toBeGreaterThan(0);
  expect(report.cards.every((c: { quote: unknown }) => c.quote === null)).toBe(true);
  for (const feature of ['players', 'odds']) {
    const r = await handler(
      new Request(`http://localhost/api/match/demo-2026-09-12-0/${feature}`),
      context,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).source).toBe('Demo');
  }
});

it('serves combo evidence and validates the exact sample window', async () => {
  const ok = await handler(
    new Request('http://localhost/api/markets?date=2026-09-12&window=5'),
    context,
  );
  expect(ok.status).toBe(200);
  const body = await ok.json();
  expect(body.window).toBe(5);
  expect(body.fixtures).toHaveLength(4);
  expect(body.fixtures.every((row: { quotes: unknown[] }) => row.quotes.length === 0)).toBe(true);
  for (const window of ['0', '6', '-5', 'five', '']) {
    expect(
      (
        await handler(
          new Request(`http://localhost/api/markets?date=2026-09-12&window=${window}`),
          context,
        )
      ).status,
    ).toBe(400);
  }
});
