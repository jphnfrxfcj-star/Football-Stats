import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';
test('saved proposals survive reload and expose result checking and export', async ({ page }) => {
  const combos = [
    {
      id: 'history-test',
      savedAt: '2026-09-10T10:00:00Z',
      bookmaker: 'Test',
      window: 5,
      minimumRate: 100,
      legs: demoFixtures('2026-09-12')
        .slice(0, 2)
        .map((f) => ({
          fixtureId: f.id,
          homeId: f.home.id,
          awayId: f.away.id,
          home: f.home.name,
          away: f.away.name,
          league: f.league.name,
          kickoff: f.kickoff,
          market: 'over25',
          decimal: 1.5,
          homeHits: 5,
          awayHits: 5,
          quoteUpdatedAt: null,
        })),
    },
  ];
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        'matchday:combo-history:v1:demo',
        JSON.stringify({ version: 1, combos: value }),
      ),
    combos,
  );
  await page.goto('/');
  const history = page.getByRole('region', { name: 'Combihistoriek' });
  await history.locator('summary').first().click();
  await expect(history.getByText('×2.25')).toBeVisible();
  await expect(history.getByText(/Laatst gecontroleerd/)).toBeVisible();
  const download = page.waitForEvent('download');
  await history.getByRole('button', { name: 'Historiek exporteren' }).click();
  expect((await download).suggestedFilename()).toBe('matchday-combihistoriek.json');
  await page.reload();
  await expect(history.locator('summary').first()).toContainText('1 bewaard');
  await history.locator('summary').first().click();
  await history.getByRole('button', { name: 'Verwijderen uit historiek' }).click();
  await expect(history.getByText(/Nog geen voorstellen bewaard/)).toBeVisible();
});
