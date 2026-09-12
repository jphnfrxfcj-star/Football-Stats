import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseFetch } from '../server/repositories/database-fetch';
import { getJson } from '../src/lib/http';
import { sleep, retryDelay } from '../src/lib/retry';
const url = 'https://example.supabase.co/rest/v1/teams';
const fail = (code: string, status = 500) =>
  new Response(JSON.stringify({ code, message: 'sensitive server detail' }), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('database resilience', () => {
  it('retries a rolled-back upsert in consistent primary-key order without exposing payloads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const call = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(fail('40P01'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const wait = vi.fn(async () => {});
    const body = JSON.stringify([
      { id: 'z', name: 'private' },
      { id: 'a', name: 'private' },
    ]);
    const r = await databaseFetch(call, wait)(url, {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates', apikey: 'secret' },
      body,
    });
    expect(r.status).toBe(204);
    expect(call).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(call.mock.calls[0][1]!.body as string).map((r: { id: string }) => r.id),
    ).toEqual(['a', 'z']);
    expect(call.mock.calls[1][1]!.body).toBe(call.mock.calls[0][1]!.body);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|private|sensitive/);
  });
  it('retries reads on network interruption but never blindly replays an interrupted lock RPC', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const call = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('{}'));
    expect((await databaseFetch(call, async () => {})(url)).status).toBe(200);
    call.mockReset().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      databaseFetch(call, async () => {})(url.replace('teams', 'rpc/acquire_sync_lock'), {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('stops after three attempts and never retries permissions/schema errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const call = vi.fn<typeof fetch>().mockImplementation(async () => fail('40001'));
    await databaseFetch(call, async () => {})(url, { method: 'POST', body: '{}' });
    expect(call).toHaveBeenCalledTimes(3);
    for (const code of ['42501', 'PGRST301', '42P01']) {
      call.mockReset().mockImplementation(async () => fail(code));
      await databaseFetch(call, async () => {})(url);
      expect(call).toHaveBeenCalledTimes(1);
    }
  });
});
describe('public API retries', () => {
  it('automatically recovers from a busy cache without user intervention', async () => {
    vi.useFakeTimers();
    const call = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'SYNC_BUSY', error: 'busy' }), {
          status: 503,
          headers: { 'Retry-After': '1' },
        }),
      )
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', call);
    const result = getJson('fixtures');
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('does not retry permanent errors or keep retrying forever', async () => {
    vi.useFakeTimers();
    const call = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => fail('SUPABASE_AUTH_FAILED', 503));
    vi.stubGlobal('fetch', call);
    await expect(getJson('fixtures')).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
    call.mockReset().mockImplementation(async () => fail('SUPABASE_REQUEST_FAILED', 503));
    const result = expect(getJson('fixtures')).rejects.toThrow();
    await vi.runAllTimersAsync();
    await result;
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('cancels pending backoff on navigation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const call = vi.fn<typeof fetch>().mockImplementation(async () => fail('SYNC_BUSY', 503));
    vi.stubGlobal('fetch', call);
    const result = expect(getJson('fixtures', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    await vi.runAllTimersAsync();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('honors retry-after limits and already-aborted waits', async () => {
    expect(retryDelay(0, '60')).toBeNull();
    expect(retryDelay(0, '2')).toBe(2000);
    const c = new AbortController();
    c.abort();
    await expect(sleep(100, c.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it('sends new secret keys through apikey without treating them as JWTs', async () => {
  const call = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
  const send = databaseFetch(call, async () => {});
  await send(url, {
    headers: { apikey: 'sb_secret_test', authorization: 'Bearer sb_secret_test' },
  });
  const headers = new Headers(call.mock.calls[0][1]!.headers);
  expect(headers.get('apikey')).toBe('sb_secret_test');
  expect(headers.has('authorization')).toBe(false);
  await send(url, {
    headers: { apikey: 'sb_secret_test', authorization: 'Bearer actual-user-jwt' },
  });
  expect(new Headers(call.mock.calls[1][1]!.headers).get('authorization')).toBe(
    'Bearer actual-user-jwt',
  );
  await send(url, { headers: { apikey: 'legacy-jwt', authorization: 'Bearer legacy-jwt' } });
  expect(new Headers(call.mock.calls[2][1]!.headers).get('authorization')).toBe(
    'Bearer legacy-jwt',
  );
});
