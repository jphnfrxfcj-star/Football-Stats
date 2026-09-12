import { sleep, retryDelay } from './retry';
const transientCodes = new Set([
  'SYNC_BUSY',
  'SUPABASE_TEMPORARY_UNAVAILABLE',
  'SUPABASE_REQUEST_FAILED',
]);
/** Bounded retries for public reads, including waiting for another server's cache fill. */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(`/api/${path}`, { signal });
    } catch (error) {
      if (signal?.aborted || attempt >= 2) throw error;
      await sleep(retryDelay(attempt, null)!, signal);
      continue;
    }
    if (response.ok) return response.json();
    const body = await response.json().catch(() => ({ error: 'Kon gegevens niet laden' }));
    const retryable =
      transientCodes.has(body.code) || (!body.code && [502, 503, 504].includes(response.status));
    const delay = retryDelay(attempt, response.headers.get('retry-after'));
    if (!retryable || attempt >= 2 || delay === null)
      throw new Error(body.error ?? 'Kon gegevens niet laden');
    await sleep(delay, signal);
  }
}
