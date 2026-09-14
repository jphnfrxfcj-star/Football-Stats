import { divisions } from '../src/domain/competitions';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverConfig } from './config';
import type { Fixture } from '../src/domain/models';
import { Repository } from './repositories/supabase';
import { downloadSource, FreeFootballProvider, type Division } from './providers/free-football';
export function refreshToken(secret: string) {
  return createHmac('sha256', secret).update('matchday:nightly-refresh:v1').digest('hex');
}
export function validRefreshToken(header: string | null, secret: string) {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.replace(/^Bearer /, '')),
    expected = Buffer.from(refreshToken(secret));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function scheduledRefreshHour(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  );
  return hour === 23 || hour === 7;
}
export async function refreshLeague(repo: Repository, year: number, division: Division) {
  const provider = new FreeFootballProvider(
    year,
    async (url, ttl) => {
      const doc = await downloadSource(url);
      await repo.cache(`free-football:source:v1:${url}`, doc, ttl);
      return doc;
    },
    division,
  );
  const rows = await provider.seasonFixtures();
  // Idempotent batches preserve stable IDs and also apply corrected results earlier in the season.
  const saved: Fixture[] = [];
  for (let i = 0; i < rows.length; i += 100)
    saved.push(...(await repo.saveFixtures(rows.slice(i, i + 100))));
  return {
    division,
    fixtures: rows.length,
    finished: saved.filter((f) => f.status === 'finished').length,
    pendingResults: saved.filter(
      (f) =>
        f.status === 'scheduled' &&
        f.kickoffKnown !== false &&
        Date.parse(f.kickoff) < Date.now() - 3 * 3600000,
    ).length,
    recentResultChecksFailed: provider.recentResultChecksFailed,
  };
}
export async function runNightlyRefresh() {
  const config = serverConfig();
  if (config.provider !== 'free-football')
    throw new Error('Nightly refresh requires the free provider');
  const repo = new Repository(config.supabaseUrl, config.supabaseKey),
    key = 'nightly:football:v1';
  if (!(await repo.lock(key))) return { skipped: true };
  const results: Awaited<ReturnType<typeof refreshLeague>>[] = [],
    failed: string[] = [];
  try {
    const { error: leaseError } = await repo.db
      .from('sync_locks')
      .update({ expires_at: new Date(Date.now() + 16 * 60000).toISOString() })
      .eq('cache_key', key);
    if (leaseError) throw new Error('Nightly lock extension failed');
    for (const division of divisions) {
      try {
        results.push(await refreshLeague(repo, config.season, division));
      } catch {
        failed.push(division);
        await repo.log(`nightly:${division}`, 'error', 'free-football');
      }
    }
    // Invalidate derived data, never the refreshed source documents or bookmaker snapshots.
    for (const table of ['provider_cache', 'analysis_results', 'h2h_cache']) {
      const { error } = await repo.db
        .from(table)
        .delete()
        .like('cache_key', `free-football:multi:v2:${config.season}:%`);
      if (error) throw new Error('Derived cache invalidation failed');
    }
    const report = { updatedAt: new Date().toISOString(), results, failed };
    await repo.cache('nightly:last-result:v1', report, 7 * 86400);
    await repo.log(key, failed.length ? 'partial' : 'success', 'free-football');
    if (failed.length) throw new Error(`Nightly update incomplete: ${failed.join(',')}`);
    return report;
  } finally {
    await repo.unlock(key);
  }
}
