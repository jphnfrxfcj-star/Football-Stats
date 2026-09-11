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
