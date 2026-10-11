import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
});

test('odds page groups model chances, filters markets and opens the selected match', async ({
  page,
}, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  expect(requests.some((url) => url.includes('/src/components/OddsPage.tsx'))).toBe(false);
  await page.getByRole('button', { name: 'Odds & kansen', exact: true }).click();
  await expect(page).toHaveURL(/\/odds$/);
  await expect(page.getByRole('heading', { name: 'Odds & kansen' })).toBeVisible();
  await expect(page.getByRole('region', { name: '70% en hoger' })).toBeVisible();
  await expect(page.locator('.odds-board-row')).toHaveCount(36);
  await expect(page.locator('.odds-board-price').first()).toContainText('Geen odd beschikbaar');
  await page.getByLabel('Oddsenmarkt').selectOption('over15');
  await expect(page.locator('.odds-board-row')).toHaveCount(4);
  await page.getByLabel('Periode odds').selectOption('3');
  await expect(page.locator('.odds-board-row')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.odds-board-open').first().click();
  await expect(page).toHaveURL(/\/match\//);
  await expect(page.getByRole('heading', { name: 'Kansen in één oogopslag' })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Periode odds')).toHaveValue('3');
  await expect(page.locator('.odds-board-row')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('available bookmaker prices show only matching markets with their source', async ({
  page,
}) => {
  await page.route('**/src/api.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
const originalBoard = api.oddsBoard;
api.oddsBoard = async (...args) => {
  const report = await originalBoard(...args);
  const match = report.matches[0];
  match.markets.find(m => m.key === 'over15').quotes = [{
    home: match.fixture.home.name, away: match.fixture.away.name,
    date: match.fixture.sourceDate, kickoff: match.fixture.kickoff,
    market: 'over15', bookmaker: 'Unibet België', decimal: 1.85,
    observedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }];
  report.odds.kind = 'feed'; report.odds.message = '';
  return report;
};`,
    });
  });
  await page.goto('/odds');
  await expect(page.locator('.odds-board-row')).toHaveCount(1);
  await expect(page.locator('.odds-board-price')).toContainText('1.85');
  await expect(page.getByLabel('Oddsbookmaker')).toHaveValue('Unibet België');
  await page.getByLabel('Toon ook zonder odd').check();
  await expect(page.locator('.odds-board-row')).toHaveCount(36);
  await page.locator('.language-control select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Odds & probabilities' })).toBeVisible();
  await expect(page.getByRole('region', { name: '70% and above' })).toBeVisible();
});
