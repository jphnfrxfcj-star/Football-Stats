// Warm historical statistics with bounded server requests. Never expose SYNC_SECRET to Vite.
const [origin, fixtureId] = process.argv.slice(2);
if (!origin || !fixtureId || !process.env.SYNC_SECRET) {
  console.error(
    'Usage: SYNC_SECRET=… node scripts/sync-match.mjs https://your-site.netlify.app af-fixture-123',
  );
  process.exit(1);
}
async function request(path, init) {
  const response = await fetch(new URL(path, origin), init);
  if (!response.ok) throw new Error(`Sync failed (${response.status}): ${await response.text()}`);
  return response.json();
}
const analysis = await request(`/api/match/${encodeURIComponent(fixtureId)}/analysis`);
const fixtures = [
  ...new Map(
    [
      ...analysis.data.homeHistory.slice(0, 20),
      ...analysis.data.awayHistory.slice(0, 20),
      ...analysis.data.h2h,
    ].map((f) => [f.id, f]),
  ).values(),
];
console.log(
  `Synchronizing statistics for ${fixtures.length} unique historical fixtures. Up to two provider requests per missing fixture.`,
);
for (const [i, fixture] of fixtures.entries()) {
  if (i) await new Promise((resolve) => setTimeout(resolve, 13000));
  const result = await request(`/api/sync/fixture/${encodeURIComponent(fixture.id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.SYNC_SECRET}` },
  });
  console.log(
    `${i + 1}/${fixtures.length}: ${fixture.id}: ${result.statisticsSynced ? 'stored' : 'not available'}`,
  );
}
console.log('Finished. Reload the match analysis.');
