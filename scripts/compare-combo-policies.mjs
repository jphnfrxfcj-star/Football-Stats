/** Run MATCHDAY_AUDIT_EXTENDED=1 node scripts/audit-combo-model.mjs first. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { sources, samples } = JSON.parse(
  await readFile(join(tmpdir(), 'matchday-model-audit', 'extended-samples.json'), 'utf8'),
);
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) =>
  Math.log(Math.max(0.001, Math.min(0.999, p)) / (1 - Math.max(0.001, Math.min(0.999, p))));
// Two-parameter Platt calibration, fitted only on 2023/24. Ridge penalty fixed at 1.
function fit(rows, key) {
  let a = 0,
    b = 1;
  for (let step = 0; step < 60; step++) {
    let ga = a,
      gb = b,
      haa = 1,
      hab = 0,
      hbb = 1;
    for (const r of rows) {
      const x = logit(r[key]),
        p = sigmoid(a + b * x),
        v = p * (1 - p);
      ga += p - r.y;
      gb += (p - r.y) * x;
      haa += v;
      hab += v * x;
      hbb += v * x * x;
    }
    const det = haa * hbb - hab * hab;
    const da = (hbb * ga - hab * gb) / det,
      db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  return { a, b };
}
function metrics(rows, key) {
  if (!rows.length) return { n: 0 };
  const p = (r) => Math.max(0.000001, Math.min(0.999999, r[key]));
  return {
    n: rows.length,
    mean: rows.reduce((s, r) => s + p(r), 0) / rows.length,
    observed: rows.reduce((s, r) => s + r.y, 0) / rows.length,
    brier: rows.reduce((s, r) => s + (p(r) - r.y) ** 2, 0) / rows.length,
    logLoss:
      rows.reduce((s, r) => s - r.y * Math.log(p(r)) - (1 - r.y) * Math.log(1 - p(r)), 0) /
      rows.length,
    bins: Array.from({ length: 10 }, (_, i) => {
      const b = rows.filter((r) => Math.min(9, Math.floor(p(r) * 10)) === i);
      return {
        lower: i / 10,
        n: b.length,
        mean: b.length ? b.reduce((s, r) => s + p(r), 0) / b.length : null,
        observed: b.length ? b.reduce((s, r) => s + r.y, 0) / b.length : null,
      };
    }),
  };
}
const marketResults = {};
for (const market of [...new Set(samples.map((r) => r.market))]) {
  const rows = samples.filter((r) => r.market === market);
  const fitParams = fit(
    rows.filter((r) => r.season === '2324'),
    'poisson',
  );
  for (const r of rows) {
    r.minimum = Math.min(r.weighted, r.poisson);
    r.meanModels = (r.weighted + r.poisson) / 2;
    r.calibrated = sigmoid(fitParams.a + fitParams.b * logit(r.poisson));
  }
  const keys = ['league', 'weighted', 'poisson', 'minimum', 'meanModels', 'calibrated'];
  const validation = rows.filter((r) => r.season === '2425');
  const candidates = ['poisson', 'calibrated'];
  const chosen = candidates.sort(
    (a, b) => metrics(validation, a).brier - metrics(validation, b).brier,
  )[0];
  const holdout = rows.filter((r) => r.season === '2526');
  const priceRows = holdout.filter((r) => r.qualifies80 && r.price >= 1.1);
  const policies = Object.fromEntries(
    [0, 0.02, 0.05].map((margin) => {
      const bets = priceRows.filter((r) => r.minimum >= 1 / r.price + margin);
      return [
        String(margin),
        {
          n: bets.length,
          hitRate: bets.length ? bets.reduce((s, r) => s + r.y, 0) / bets.length : null,
          indicativeUnitReturn: bets.length
            ? bets.reduce((s, r) => s + (r.y ? r.price - 1 : -1), 0) / bets.length
            : null,
        },
      ];
    }),
  );
  marketResults[market] = {
    calibrationFitSeason: '2324',
    fitParams,
    selectedOnValidation: chosen,
    validation: Object.fromEntries(keys.map((k) => [k, metrics(validation, k)])),
    holdout: Object.fromEntries(keys.map((k) => [k, metrics(holdout, k)])),
    qualified80Holdout: Object.fromEntries(
      keys.map((k) => [
        k,
        metrics(
          holdout.filter((r) => r.qualifies80),
          k,
        ),
      ]),
    ),
    priceDiagnostic: { availablePriceCount: priceRows.length, policies },
  };
}
const report = {
  generatedAt: new Date().toISOString(),
  protocol:
    '2022/23 warm-up; sigmoid calibration fit on 2023/24 only (ridge=1 fixed); choice on 2024/25; new 2025/26 holdout. Same-day results excluded. No parameter search on holdout. Prices only for B365 over/under2.5; unknown collection timestamps, no Unibet/BTTS ROI validation. Price diagnostics are descriptive, not policy selection.',
  sources,
  marketResults,
};
await writeFile('docs/combo-policy-audit.json', JSON.stringify(report, null, 2) + '\n');
for (const [m, r] of Object.entries(marketResults))
  console.log(
    m,
    JSON.stringify({
      chosen: r.selectedOnValidation,
      n: r.holdout.poisson.n,
      brier: Object.fromEntries(Object.entries(r.holdout).map(([k, v]) => [k, v.brier])),
      priceDiagnostic: r.priceDiagnostic,
    }),
  );
