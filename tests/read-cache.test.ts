import { afterEach, expect, it, vi } from 'vitest';
import { cachedRead } from '../src/lib/read-cache';

afterEach(() => vi.unstubAllGlobals());

it('shares requests, keeps timestamps and explicitly refreshes successful data', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ updatedAt: 'original' })));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const first = cachedRead('cache-test', controller.signal);
  const second = cachedRead('cache-test');
  controller.abort();
  await expect(first).rejects.toThrow();
  await expect(second).resolves.toEqual({ updatedAt: 'original' });
  await expect(cachedRead('cache-test')).resolves.toEqual({ updatedAt: 'original' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(new Response(JSON.stringify({ updatedAt: 'new' })));
  await expect(cachedRead('cache-test', undefined, true)).resolves.toEqual({ updatedAt: 'new' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not cache failed requests', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('{"error":"Unavailable"}', { status: 400 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(cachedRead('failed-cache-test')).rejects.toThrow('Unavailable');
  fetcher.mockResolvedValue(new Response('[1]'));
  await expect(cachedRead('failed-cache-test')).resolves.toEqual([1]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
