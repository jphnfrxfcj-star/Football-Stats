import { afterEach, expect, it, vi } from 'vitest';
import { MemoryCache } from '../server/repositories/memory-cache';
import { Repository } from '../server/repositories/supabase';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('preserves database expiry and caps local reuse at thirty seconds', () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  const c = new MemoryCache();
  c.set('short', [1], 2000);
  c.set('long', [2], 100000);
  vi.setSystemTime(2000);
  expect(c.get('short')).toBeNull();
  expect(c.get('long')).toEqual([2]);
  vi.setSystemTime(31000);
  expect(c.get('long')).toBeNull();
});
it('bounds memory, evicts least recently used entries and isolates returned objects', () => {
  const c = new MemoryCache(100, 2);
  const expiry = Date.now() + 60000;
  c.set('a', { v: 1 }, expiry);
  c.set('b', { v: 2 }, expiry);
  const a = c.get<{ v: number }>('a')!;
  a.v = 9;
  c.set('c', { v: 3 }, expiry);
  expect(c.get('b')).toBeNull();
  expect(c.get('a')).toEqual({ v: 1 });
  c.set('too-large', 'x'.repeat(101), expiry);
  expect(c.get('too-large')).toBeNull();
  c.set('null', null, expiry);
  expect(c.get('null')).toBeNull();
});
it('reuses repository reads, separates tables and refreshes after a successful write', async () => {
  const expires_at = new Date(Date.now() + 60000).toISOString();
  const call = vi.fn<typeof fetch>().mockImplementation(
    async (_url, init) =>
      new Response(init?.method === 'POST' ? null : JSON.stringify({ data: [1], expires_at }), {
        status: init?.method === 'POST' ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', call);
  const repo = new Repository('https://example.supabase.co', 'sb_secret_test');
  expect(await repo.cached('key')).toEqual([1]);
  expect(await repo.cached('key')).toEqual([1]);
  expect(call).toHaveBeenCalledTimes(1);
  expect(String(call.mock.calls[0][0])).toContain('expires_at=gt.');
  await repo.cached('key', 'analysis_results');
  expect(call).toHaveBeenCalledTimes(2);
  await repo.cache('key', [2], 60);
  expect(await repo.cached('key')).toEqual([2]);
  expect(call).toHaveBeenCalledTimes(3);
});
