import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@netlify/functions';
import handler from '../netlify/functions/api';
import { databaseFetch } from '../server/repositories/database-fetch';
import { countTiming, measurePhase, withServerTiming } from '../server/timing';

const response = () => new Response('{}');
afterEach(() => vi.unstubAllEnvs());

describe('request-local origin timing', () => {
  it('isolates interleaved requests and measures failed work without recording errors', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = withServerTiming(async () => {
      countTiming('cache_miss');
      await measurePhase('cache_load', () => gate);
      return response();
    });
    const second = await withServerTiming(async () => {
      countTiming('cache_hit');
      await expect(
        measurePhase('cache_read', async () => {
          throw new Error('private-source-token');
        }),
      ).rejects.toThrow('private-source-token');
      return response();
    });
    release();
    const a = (await first).headers.get('server-timing')!;
    const b = second.headers.get('server-timing')!;
    expect(a).toContain('cache_miss;desc="1 calls"');
    expect(a).toContain('cache_load;dur=');
    expect(a).not.toContain('cache_hit');
    expect(a).not.toContain('cache_read');
    expect(b).toContain('cache_hit;desc="1 calls"');
    expect(b).toContain('cache_read;dur=');
    expect(b).not.toContain('cache_miss');
    expect(b).not.toContain('cache_load');
    expect(b).not.toContain('private-source-token');
  });

  it('bounds cardinality even for repeated phases and rejects arbitrary runtime labels', async () => {
    const result = await withServerTiming(async () => {
      for (let i = 0; i < 100; i++) {
        countTiming('cache_hit');
        await measurePhase('cache_read', async () => true);
      }
      // Runtime guards also protect JavaScript callers and unchecked input.
      await measurePhase('private-key' as 'cache_read', async () => true);
      countTiming('private-token' as 'cache_hit');
      return response();
    });
    const header = result.headers.get('server-timing')!;
    expect(header.match(/cache_read/g)).toHaveLength(1);
    expect(header).toContain('cache_hit;desc="100 calls"');
    expect(header).not.toContain('private');
    expect(header.length).toBeLessThan(200);
  });

  it('can be disabled and does not affect work outside an API request', async () => {
    expect(await measurePhase('cache_load', async () => 42)).toBe(42);
    countTiming('cache_hit');
    vi.stubEnv('SERVER_TIMING_ENABLED', 'false');
    const result = await withServerTiming(async () => {
      countTiming('cache_hit');
      return response();
    });
    expect(result.headers.has('server-timing')).toBe(false);
  });

  it('instruments API errors and successful reads without changing caching policy', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    for (const [path, status] of [
      ['/api/leagues', 200],
      ['/api/fixtures?date=private-query-token', 400],
    ] as const) {
      const result = await handler(new Request(`https://example.test${path}`), {} as Context);
      expect(result.status).toBe(status);
      expect(result.headers.get('server-timing')).toMatch(/^total;dur=\d+\.\d$/);
      expect(result.headers.get('cache-control')).toBe(
        status === 200 ? 'public, max-age=30' : 'no-store',
      );
    }
  });
});

it('measures real database transport wrapper without leaking URLs or headers', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const result = await withServerTiming(async () => {
    await databaseFetch(transport)(
      'https://private-project.supabase.co/rest/v1/provider_cache?cache_key=secret',
      { headers: { apikey: 'private-key' } },
    );
    return response();
  });
  expect(transport).toHaveBeenCalledOnce();
  expect(result.headers.get('server-timing')).toMatch(/^total;dur=\d+\.\d, database;dur=\d+\.\d$/);
  expect(result.headers.get('server-timing')).not.toMatch(/private|secret|supabase/);
});
