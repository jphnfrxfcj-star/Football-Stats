import { expect, test } from '@playwright/test';
import { demoFixtures, demoMatch } from '../../src/demo/data';
import { buildMarkets } from '../../src/analysis/combinations';
import type { Fixture } from '../../src/domain/models';
const now = Date.parse('2026-09-12T00:00:00Z');

test('screens prices by default, explains rejected BTTS and keeps history-only an explicit choice', async ({
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
  await expect(finder.getByLabel('Beoordeling combi')).toHaveValue('checked');
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(1);
  await expect(finder.locator('.combo-card .combo-assessment').first()).toHaveCSS(
    'display',
    'grid',
  );
  await expect(finder.locator('.combo-card')).not.toContainText(fixtures[2].home.name);
  await finder.locator('.combo-rejections > summary').click();
  await expect(finder.locator('.combo-rejections')).toContainText('Te weinig modelmarge');
  await expect(finder.locator('.combo-rejections')).toContainText(fixtures[2].home.name);
  await finder.locator('.combo-rejections .combo-assessment summary').click();
  await expect(finder.locator('.combo-rejections')).toContainText('Trend thuisploeg: 4/5');
  for (const width of info.project.name === 'mobile' ? [360, 390] : [1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await finder.screenshot({ path: `/tmp/combo-price-check-${width}.png` });
  }
  await page.getByLabel('Taal', { exact: true }).selectOption('en');
  await expect(page.getByLabel('Combination assessment')).toHaveValue('checked');
  await expect(finder.locator('.combo-rejections')).toContainText('Insufficient model margin');
  await page.getByLabel('Combination assessment').selectOption('history');
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(finder).toContainText('the price is not assessed');
  await page.getByLabel('Combination assessment').selectOption('checked');
  await expect(finder.locator('.combo-card')).toHaveCount(1);
});
