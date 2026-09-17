import { expect, test } from '@playwright/test';
import { demoMatch } from '../../src/demo/data';
import { buildMarkets } from '../../src/analysis/combinations';
import { analyze } from '../../src/analysis/engine';
import { probabilities } from '../../src/analysis/probability';

test('shows fallback dates and prevents proposals from incomplete saved history in both languages', async ({
  page,
}) => {
  const now = Date.parse('2026-09-17T08:00:00Z');
  await page.clock.setFixedTime(new Date(now));
  let apiPath = '';
  page.on('request', (r) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(r.url())) apiPath = r.url();
  });
  await page.goto('/');
  const data = demoMatch('demo-2026-09-18-0')!;
  data.fixture.availability = {
    status: 'fallback',
    source: 'Football-data.org',
    updatedAt: '2026-09-17T07:00:00Z',
  };
  data.availability = {
    status: 'partial',
    source: 'Opgeslagen historie en beschikbare uitslagen',
    updatedAt: '2026-09-16T07:00:00Z',
  };
  data.warnings = [];
  const analysis = analyze(data);
  const report = buildMarkets(
    [data],
    {
      source: 'Test',
      kind: 'snapshot',
      fetchedAt: new Date(now).toISOString(),
      quotes: [],
      message: '',
    },
    5,
    now,
    80,
  );
  await page.evaluate(
    async ({ apiPath, data, analysis, report, probabilities }) => {
      const { api } = await import(apiPath);
      api.fixtures = async () => [data.fixture];
      api.analysis = async () => ({ data, analysis, probabilities });
      api.markets = async () => report;
    },
    { apiPath, data, analysis, report, probabilities: probabilities(data, analysis) },
  );
  await page.getByLabel('Wedstrijddatum').fill('2026-09-18');
  await expect(page.locator('.data-notice').first()).toContainText('Football-data.org');
  await expect(page.locator('.data-notice').first()).toContainText('17/9/2026');
  await page.locator('.fixture-row').first().click();
  await expect(page.locator('.data-notice').first()).toContainText(
    'automatische combivoorstellen zijn uitgeschakeld',
  );
  await expect(page.locator('.data-notice').first()).toContainText('16/9/2026');
  await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(page.locator('.data-notice')).toContainText(
    'automatische combivoorstellen zijn uitgeschakeld',
  );
  await expect(page.locator('.combo-card')).toHaveCount(0);
  await page.getByLabel('Taal', { exact: true }).selectOption('en');
  await expect(page.locator('.data-notice')).toContainText(
    'automatic combination proposals are disabled',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.combo-finder')
    .screenshot({ path: `/tmp/data-fallback-${page.viewportSize()!.width}.png` });
});
