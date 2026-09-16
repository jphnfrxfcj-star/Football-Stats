/** Reproducible, chronological diagnostic. No betting-profit or calibration claim. */
import { createServer } from 'vite';
import { parse } from 'csv-parse/sync';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { weightedMarket, occurrence } = await server.ssrLoadModule('/src/analysis/engine.ts');
  const { goalMarketProbability } = await server.ssrLoadModule('/src/analysis/combo-assessment.ts');
  const cache = join(tmpdir(), 'matchday-model-audit');
  await mkdir(cache, { recursive: true });
  const sources = [];
  const samples = [];
  const markets = [
    'btts',
    'over05',
    'over15',
    'over25',
    'over35',
    'under25',
    'firstHalf05',
    'firstHalf15',
  ];
  for (const division of ['E0', 'SP1', 'I1', 'F1']) {
    const rows = [];
    for (const season of process.env.MATCHDAY_AUDIT_EXTENDED
      ? ['2223', '2324', '2425', '2526']
      : ['2223', '2324', '2425']) {
      const url = `https://www.football-data.co.uk/mmz4281/${season}/${division}.csv`;
      const file = join(cache, `${division}-${season}.csv`);
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        text = await r.text();
        await writeFile(file, text);
      }
      sources.push({ url, sha256: createHash('sha256').update(text).digest('hex') });
      for (const r of parse(text, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      })) {
        if (!r.Date || !r.HomeTeam || !r.AwayTeam || !/^\d+$/.test(r.FTHG) || !/^\d+$/.test(r.FTAG))
          continue;
        const [day, month, year] = r.Date.split('/');
        const date = `${year.length === 2 ? '20' + year : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const team = (name) => ({ id: division + ':' + name, name });
        rows.push({
          id: `${division}:${season}:${r.HomeTeam}:${r.AwayTeam}`,
          season,
          division,
          over25Price: Number(r['B365>2.5']) || null,
          under25Price: Number(r['B365<2.5']) || null,
          kickoff: `${date}T12:00:00Z`,
          status: 'finished',
          home: team(r.HomeTeam),
          away: team(r.AwayTeam),
          homeGoals: Number(r.FTHG),
          awayGoals: Number(r.FTAG),
          halfHomeGoals: /^\d+$/.test(r.HTHG) ? Number(r.HTHG) : null,
          halfAwayGoals: /^\d+$/.test(r.HTAG) ? Number(r.HTAG) : null,
        });
      }
    }
    rows.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    for (const f of rows.filter((f) => f.season !== '2223')) {
      // Exclude all same-day results: exact final-whistle timestamps are unavailable.
      const prior = rows.filter((r) => r.kickoff < f.kickoff).reverse();
      const includes = (r, id) => r.home.id === id || r.away.id === id;
      const homeHistory = prior.filter((r) => includes(r, f.home.id)).slice(0, 60);
      const awayHistory = prior.filter((r) => includes(r, f.away.id)).slice(0, 60);
      if (homeHistory.length < 20 || awayHistory.length < 20) continue;
      const data = {
        fixture: f,
        homeHistory,
        awayHistory,
        h2h: prior.filter((r) => includes(r, f.home.id) && includes(r, f.away.id)).slice(0, 10),
      };
      for (const market of markets) {
        const hit = (r) => occurrence(r, r.home.id, market);
        if (
          hit(f) === null ||
          [...homeHistory.slice(0, 20), ...awayHistory.slice(0, 20)].some((r) => hit(r) === null)
        )
          continue;
        const leagueRows = prior.filter((r) => hit(r) !== null);
        const league = (leagueRows.filter(hit).length + 1) / (leagueRows.length + 2);
        const recent =
          (homeHistory.slice(0, 5).filter(hit).length +
            awayHistory.slice(0, 5).filter(hit).length) /
          10;
        const qualifies80 =
          homeHistory.slice(0, 5).filter(hit).length >= 4 &&
          awayHistory.slice(0, 5).filter(hit).length >= 4;
        const weighted = weightedMarket(data, market).probability / 100;
        const poisson = goalMarketProbability(data, market) / 100;
        samples.push({
          division,
          season: f.season,
          date: f.kickoff.slice(0, 10),
          market,
          price: market === 'over25' ? f.over25Price : market === 'under25' ? f.under25Price : null,
          y: Number(hit(f)),
          qualifies80,
          recent,
          league,
          weighted,
          poisson,
        });
      }
    }
  }
  if (process.env.MATCHDAY_AUDIT_EXTENDED) {
    await writeFile(join(cache, 'extended-samples.json'), JSON.stringify({ sources, samples }));
    console.log('Extended chronological samples written to temporary cache.');
  }
  function summary(rows) {
    return {
      n: rows.length,
      observed: rows.reduce((s, r) => s + r.y, 0) / rows.length,
      models: Object.fromEntries(
        ['recent', 'league', 'weighted', 'poisson'].map((key) => [
          key,
          {
            mean: rows.reduce((s, r) => s + r[key], 0) / rows.length,
            brier: rows.reduce((s, r) => s + (r[key] - r.y) ** 2, 0) / rows.length,
            logLoss:
              rows.reduce((s, r) => {
                const p = Math.max(0.000001, Math.min(0.999999, r[key]));
                return s - r.y * Math.log(p) - (1 - r.y) * Math.log(1 - p);
              }, 0) / rows.length,
            bins: Array.from({ length: 10 }, (_, i) => {
              const bin = rows.filter((r) => Math.min(9, Math.floor(r[key] * 10)) === i);
              return {
                lower: i / 10,
                n: bin.length,
                p: bin.length ? bin.reduce((s, r) => s + r[key], 0) / bin.length : null,
                observed: bin.length ? bin.reduce((s, r) => s + r.y, 0) / bin.length : null,
              };
            }),
          },
        ]),
      ),
    };
  }
  const report = {
    generatedAt: new Date().toISOString(),
    sources,
    protocol:
      '2022/23 warm-up; 2023/24 and 2024/25 chronological evaluation. No tuning; at least 20 previous matches per team. Same-day results excluded. Recent5 is a descriptive baseline, not a probability model. No historical BTTS prices: no ROI claim.',
    byMarket: Object.fromEntries(
      markets.map((m) => [m, summary(samples.filter((r) => r.market === m))]),
    ),
    qualified80: Object.fromEntries(
      markets.map((m) => [m, summary(samples.filter((r) => r.market === m && r.qualifies80))]),
    ),
    bySeason: Object.fromEntries(
      ['2324', '2425'].map((s) => [
        s,
        summary(samples.filter((r) => r.season === s && r.market === 'btts')),
      ]),
    ),
    byLeague: Object.fromEntries(
      ['E0', 'SP1', 'I1', 'F1'].map((d) => [
        d,
        summary(samples.filter((r) => r.division === d && r.market === 'btts')),
      ]),
    ),
  };
  if (!process.env.MATCHDAY_AUDIT_EXTENDED)
    await writeFile('docs/combo-model-audit.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ byMarket: report.byMarket, qualified80: report.qualified80 }, null, 2),
  );
} finally {
  await server.close();
}
