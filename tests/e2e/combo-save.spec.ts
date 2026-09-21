import { expect, test } from '@playwright/test';
import { demoFixtures, demoMatch } from '../../src/demo/data';
import { buildMarkets } from '../../src/analysis/combinations';
import type { Fixture } from '../../src/domain/models';
const now = Date.parse('2026-09-12T00:00:00Z');

test('saves proposals only on request and retains saved state across pages', async ({ page }) => {
  await page.route('**/src/api.ts*', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /export const isDemo = .*?;/,
      'export const isDemo = false;',
    );
    await route.fulfill({ response, body });
  });
  await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
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
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('matchday:combo-history:v1') ?? '{"combos":[]}').combos,
    );
  expect(await stored()).toHaveLength(0);
  await finder.getByRole('button', { name: 'Bijhouden', exact: true }).first().click();
  await expect(finder.getByRole('button', { name: 'Bewaard', exact: true })).toHaveCount(1);
  const original = await stored();
  expect(original).toHaveLength(1);
  await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(finder.getByRole('button', { name: 'Bewaard', exact: true })).toHaveCount(1);
  expect(await stored()).toEqual(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
