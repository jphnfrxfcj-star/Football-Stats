import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';

test('combined refresh preserves each source on partial failure and stays busy until both finish', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  const id = demoFixtures('2026-09-12')[0].id;
  await page.goto(`/match/${id}`);
  const refresh = page.getByRole('button', { name: 'Analyse en odds bijwerken', exact: true });
  const odds = page.getByRole('region', { name: 'Bookmakervergelijking' });
  await expect(refresh).toBeEnabled();
  await expect(odds).toContainText('Bron: Demo');
  await page.evaluate(
    async ({ path, id }) => {
      const { api } = await import(path);
      const baseline = await api.analysis(id);
      (window as any).analysisCalls = 0;
      api.analysis = async () => {
        (window as any).analysisCalls++;
        return {
          ...baseline,
          data: { ...baseline.data, fixture: { ...baseline.data.fixture, venue: 'Nieuw stadion' } },
        };
      };
      api.odds = async () => {
        throw new Error('Oddsbron tijdelijk onbereikbaar');
      };
    },
    { path: apiPath, id },
  );
  await refresh.click();
  await expect(page.locator('.match-hero')).toContainText('Nieuw stadion');
  await expect(odds.getByRole('alert')).toContainText('Oddsbron tijdelijk onbereikbaar');
  await expect(odds).toContainText('Bron: Demo');
  await expect(refresh).toBeEnabled();
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.analysis = () => {
      (window as any).analysisCalls++;
      return new Promise((_resolve, reject) => {
        (window as any).rejectAnalysis = reject;
      });
    };
    api.odds = () =>
      new Promise((resolve) => {
        (window as any).resolveOdds = resolve;
      });
  }, apiPath);
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await page.evaluate(() =>
    (window as any).rejectAnalysis(new Error('Analysebron tijdelijk onbereikbaar')),
  );
  await expect(page.getByRole('alert')).toContainText('Analysebron tijdelijk onbereikbaar');
  await expect(refresh).toBeDisabled();
  await page.evaluate(() =>
    (window as any).resolveOdds({
      source: 'Nieuwe oddsbron',
      kind: 'feed',
      fetchedAt: '2026-09-12T07:59:00Z',
      quotes: [],
      message: '',
    }),
  );
  await expect(odds).toContainText('Bron: Nieuwe oddsbron');
  await expect(page.locator('.match-hero')).toContainText('Nieuw stadion');
  await expect(refresh).toBeEnabled();
  const calls = await page.evaluate(() => (window as any).analysisCalls);
  await odds.getByRole('button', { name: 'Opnieuw laden', exact: true }).click();
  expect(await page.evaluate(() => (window as any).analysisCalls)).toBe(calls);
  await page.evaluate(() =>
    (window as any).resolveOdds({
      source: 'Nieuwe oddsbron',
      kind: 'feed',
      fetchedAt: '2026-09-12T07:59:00Z',
      quotes: [],
      message: '',
    }),
  );
  await expect(refresh).toBeEnabled();
});
