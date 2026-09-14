/** One-time import and source-cache warmup. Credentials only through server environment. */
import { refreshLeague } from '../server/nightly-refresh';
import { Repository } from '../server/repositories/supabase';
import { downloadSource, FreeFootballProvider } from '../server/providers/free-football';
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error('Server environment required');
const year = Number(process.env.FOOTBALL_SEASON ?? 2026);
const repo = new Repository(url, key);
for (const division of ['I1', 'F1'] as const) {
  console.log(JSON.stringify(await refreshLeague(repo, year, division)));
  const provider = new FreeFootballProvider(
    year,
    async (url, ttl) => {
      const cacheKey = `free-football:source:v1:${url}`;
      const cached = await repo.cached<Awaited<ReturnType<typeof downloadSource>>>(cacheKey);
      if (cached) return cached;
      const doc = await downloadSource(url);
      await repo.cache(cacheKey, doc, ttl);
      return doc;
    },
    division,
  );
  const rows = await provider.previewRange(new Date().toISOString().slice(0, 10), 8);
  console.log(JSON.stringify({ division, upcoming: rows.length, historyWarm: true }));
}
