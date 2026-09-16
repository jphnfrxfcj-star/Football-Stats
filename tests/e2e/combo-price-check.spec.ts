import { expect, test } from '@playwright/test';
import { demoFixtures, demoMatch } from '../../src/demo/data';
import { buildMarkets } from '../../src/analysis/combinations';
import type { Fixture } from '../../src/domain/models';
const now = Date.parse('2026-09-12T00:00:00Z');

test('keeps the homepage simple and makes advanced review useful even without a strict combination', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date(now));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/');
  const fixtures = demoFixtures('2026-09-12').slice(0, 3);
  const matches = fixtures.map((fixture, index) => {
    const history = (side: 'home' | 'away') =>
      Array.from({ length: 20 }, (_, i): Fixture => {
        const team = fixture[side],
          opponent = { ...team, id: `opponent-${index}-${side}-${i}` };
        const hit = index < 2 || i < 4 || (i >= 5 && i % 3 === 0);
        return {
          ...fixture,
          id: `history-${index}-${side}-${i}`,
          status: 'finished',
          kickoff: new Date(now - (i + 1) * 7 * 86400000).toISOString(),
          home: i % 2 ? opponent : team,
          away: i % 2 ? team : opponent,
          homeGoals: hit ? 2 : 0,
          awayGoals: hit ? 2 : 0,
          halfHomeGoals: 1,
          halfAwayGoals: 0,
        };
      });
    return {
      ...demoMatch(fixture.id)!,
      fixture,
      homeHistory: history('home'),
      awayHistory: history('away'),
      h2h: [],
    };
  });
  const report = buildMarkets(
    matches,
    {
      kind: 'feed',
      source: 'Test',
      message: '',
      fetchedAt: new Date(now).toISOString(),
      quotes: fixtures.map((f) => ({
        home: f.home.name,
        away: f.away.name,
        date: '2026-09-12',
        kickoff: f.kickoff,
        market: 'btts',
        bookmaker: 'Unibet België',
        decimal: 1.6,
        updatedAt: new Date(now).toISOString(),
      })),
    },
    5,
    now,
    80,
  );
  await page.evaluate(
    async ({ path, report }) => {
      const { api } = await import(path);
      api.markets = async () => report;
    },
    { path: apiPath, report },
  );
  const finder = page.locator('.combo-finder');
  await expect(finder.getByLabel('Beoordeling combi')).toHaveCount(0);
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(finder.locator('.combo-assessment')).toHaveCount(0);
  for (const total of await finder.locator('.combo-total').allTextContents()) {
    expect(Number(total.replace('×', ''))).toBeGreaterThanOrEqual(2);
    expect(Number(total.replace('×', ''))).toBeLessThanOrEqual(3);
  }
  await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
  await expect(finder.getByLabel('Beoordeling combi')).toHaveValue('review');
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(finder.locator('.combo-card').first()).not.toContainText(fixtures[2].home.name);
  await expect(finder.locator('.combo-card').last().locator('.combo-model-summary')).toContainText(
    'onder break-even',
  );
  await finder.getByLabel('Beoordeling combi').selectOption('strict');
  await expect(finder.locator('.combo-card')).toHaveCount(1);
  await finder.locator('.combo-rejections > summary').click();
  await expect(finder.locator('.combo-rejections')).toContainText(fixtures[2].home.name);
  await finder.locator('.combo-rejections .combo-assessment summary').click();
  await expect(finder.locator('.combo-rejections')).toContainText('Trend thuisploeg: 4/5');
  // Only one usable approved match remains; surface that selection rather than an empty feature.
  const limited = {
    ...report,
    selections: report.selections.filter((s) => s.fixture.id !== fixtures[1].id),
  };
  await page.evaluate(
    async ({ path, report }) => {
      const { api } = await import(path);
      api.markets = async () => report;
    },
    { path: apiPath, report: limited },
  );
  await finder.getByRole('button', { name: 'Combi zoeken / verversen' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(0);
  await expect(finder).toContainText('Verschillende wedstrijden die de margefilter halen: 1');
  await expect(finder.locator('.combo-candidates')).toHaveAttribute('open', '');
  await expect(finder.locator('.combo-candidates article')).toHaveCount(1);
  await expect(finder.locator('.combo-candidates')).toContainText(fixtures[0].home.name);
  await expect(finder.getByLabel('Combi minimumfrequentie')).toHaveValue('80');
  for (const width of info.project.name === 'mobile' ? [360, 390] : [1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await finder.screenshot({ path: `/tmp/combo-review-${width}.png` });
  }
  await page.getByLabel('Taal', { exact: true }).selectOption('en');
  await expect(page.getByLabel('Combination assessment')).toHaveValue('strict');
  await expect(finder).toContainText('Distinct matches passing the margin filter: 1');
  await page.getByLabel('Combination assessment').selectOption('review');
  await expect(finder.locator('.combo-card')).toHaveCount(1);
  await expect(finder.locator('.combo-card .combo-model-summary')).toContainText(
    'below break-even',
  );
  await expect(finder.getByLabel('Combination minimum frequency')).toHaveValue('80');
});
