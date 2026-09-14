/** Measure real multi-league history size and cached market latency. Server credentials only. */
import { Repository } from '../server/repositories/supabase';
import { MultiLeagueProvider } from '../server/providers/multi-league';
import { downloadSource } from '../server/providers/free-football';
import { FootballService } from '../server/service';
import { packMarketHistory } from '../server/market-history';
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error('Server environment required');
const repo = new Repository(url, key);
let svc: FootballService;
const provider = new MultiLeagueProvider(2026, (url, ttl) =>
  svc.cached(`free-football:source:v1:${url}`, ttl, () => downloadSource(url)),
);
svc = new FootballService(provider, repo);
const date = new Date().toISOString().slice(0, 10);
const rows = await provider.previewRange(date, 8);
const packed = packMarketHistory(rows);
console.log(
  JSON.stringify({
    matches: rows.length,
    originalKB: Math.round(JSON.stringify(rows).length / 1024),
    packedKB: Math.round(JSON.stringify(packed).length / 1024),
  }),
);
for (const rate of [100, 80]) {
  const t = Date.now();
  const report = await svc.markets(date, 5, 8, rate);
  console.log(
    JSON.stringify({
      rate,
      seconds: (Date.now() - t) / 1000,
      matches: report.fixtures.length,
      selections: report.selections.length,
      responseKB: Math.round(JSON.stringify(report).length / 1024),
    }),
  );
}
