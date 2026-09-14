import { sleep, retryDelay } from '../../src/lib/retry';
const primaryKeys: Record<string, string[]> = {
  leagues: ['id'],
  teams: ['id'],
  fixtures: ['id'],
  league_provider_ids: ['provider', 'provider_league_id'],
  team_provider_ids: ['provider', 'provider_team_id'],
  fixture_provider_ids: ['provider', 'provider_fixture_id'],
  fixture_statistics: ['fixture_id', 'provider'],
  fixture_events: ['fixture_id', 'provider'],
  team_match_stats: ['fixture_id', 'team_id', 'provider'],
  provider_cache: ['cache_key'],
  analysis_results: ['cache_key'],
  h2h_cache: ['cache_key'],
};
export const rollbackCodes = new Set([
  '40P01',
  '40001',
  '55P03',
  '57014',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
]);
function orderedBody(resource: string, init: RequestInit): RequestInit {
  const columns = primaryKeys[resource];
  if (
    !columns ||
    init.method?.toUpperCase() !== 'POST' ||
    !new Headers(init.headers).get('prefer')?.includes('resolution=merge-duplicates') ||
    typeof init.body !== 'string'
  )
    return init;
  const rows: unknown = JSON.parse(init.body);
  if (!Array.isArray(rows)) return init;
  rows.sort((a, b) => {
    for (const column of columns) {
      const x = String(a[column]),
        y = String(b[column]);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });
  return { ...init, body: JSON.stringify(rows) };
}
/** Retry confirmed pre-execution/rolled-back failures; never replay ambiguous POST transport failures. */
export function databaseFetch(
  fetchImpl: typeof fetch = fetch,
  wait: typeof sleep = sleep,
): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const resource = url.pathname.replace(/^\/rest\/v1\//, '');
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const apiKey = headers.get('apikey');
    // New secret keys are not JWTs. Retain user/legacy JWTs; remove only the redundant secret bearer.
    if (apiKey?.startsWith('sb_secret_') && headers.get('authorization') === `Bearer ${apiKey}`)
      headers.delete('authorization');
    const request = orderedBody(resource, {
      ...init,
      headers,
      signal: init.signal ?? (input instanceof Request ? input.signal : undefined),
    });
    const method = (
      request.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const read = ['GET', 'HEAD'].includes(method);
    const safeResource =
      primaryKeys[resource] ||
      ['rpc/acquire_sync_lock', 'rpc/check_rate_limit', 'sync_locks', 'provider_sync_log'].includes(
        resource,
      )
        ? resource
        : 'unknown';
    for (let attempt = 0; ; attempt++) {
      request.signal?.throwIfAborted();
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(8000);
        response = await fetchImpl(input, {
          ...request,
          signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
        });
      } catch (error) {
        if (request.signal?.aborted) throw error;
        console.warn('Database transport interrupted', { resource: safeResource, method, attempt });
        if (!read || attempt >= 2) throw error;
        await wait(retryDelay(attempt, null)!, request.signal ?? undefined);
        continue;
      }
      if (response.ok) return response;
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      const code =
        typeof body?.code === 'string' && /^[A-Z0-9]{5,12}$/.test(body.code)
          ? body.code
          : 'UNKNOWN';
      // The gateway mints its own JWT for secret keys. A future-issued rejection
      // happens before SQL executes, so even an RPC can safely be retried here.
      const gatewayClockFailure =
        response.status === 401 &&
        code === 'PGRST303' &&
        body?.message === 'JWT issued at future' &&
        apiKey?.startsWith('sb_secret_') === true &&
        !headers.has('authorization');
      const transient =
        gatewayClockFailure ||
        rollbackCodes.has(code) ||
        (read && [429, 502, 503, 504, 520].includes(response.status));
      const baseDelay = retryDelay(attempt, response.headers.get('retry-after'), 2000);
      const delay =
        baseDelay === null
          ? null
          : gatewayClockFailure
            ? Math.max(1000 * (attempt + 1), baseDelay)
            : baseDelay;
      console.warn('Database request failed', {
        resource: safeResource,
        method,
        status: response.status,
        code,
        attempt,
        retrying: transient && attempt < 2 && delay !== null,
      });
      if (!transient || attempt >= 2 || delay === null) {
        if (gatewayClockFailure) {
          await response.body?.cancel();
          // Internal-only classification; no upstream details or credentials escape.
          return new Response(
            JSON.stringify({
              code: 'GATEWAY_CLOCK_SKEW',
              message: 'Temporary database authentication failure',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }
        return response;
      }
      await response.body?.cancel();
      await wait(delay, request.signal ?? undefined);
    }
  };
}
