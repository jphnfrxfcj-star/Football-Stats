import { demoFixtures } from '../../src/demo/data';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
});
test('switches language without resetting filters and persists it across pages and reloads', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Filter op ploeg' }).click();
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await page.getByLabel('Taal', { exact: true }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Filter by team' })).toContainText('Arsenal');
  await page.getByRole('button', { name: 'Filter by team' }).click();
  await expect(page.getByRole('region', { name: 'Choose a team' })).toContainText(
    'Teams playing on this date',
  );
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Every match. More insight.' })).toBeVisible();
  await page.locator('.fixture-row').click();
  await expect(page.getByRole('heading', { name: 'Bookmaker odds', exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Sample data: matches and statistics are synthetic and unsuitable for real predictions.',
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Odds versus statistics')).not.toContainText('Geen model');
  await expect(page.getByLabel('Analysis bookmaker')).toHaveValue('Unibet België');
  await expect(page.getByLabel('Analysis bookmaker')).toContainText('Unibet Belgium');
  await page.getByRole('button', { name: 'View players', exact: true }).click();
  await expect(page.locator('#players')).toContainText('No player statistics available');
  await page.getByRole('button', { name: 'Our model', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('The data behind the probabilities.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Combination ideas', exact: true }).click();
  await page.getByLabel('Minimum target odds').fill('5');
  await page.getByLabel('Maximum target odds').fill('7');
  await page.getByLabel('Combination minimum frequency').selectOption('60');
  await page.getByLabel('Language', { exact: true }).selectOption('nl');
  await expect(page.getByLabel('Minimale doelodd')).toHaveValue('5');
  await expect(page.getByLabel('Combi minimumfrequentie')).toHaveValue('60');
  await page.getByLabel('Taal', { exact: true }).selectOption('en');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Combination ideas', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Suggest a combination', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `/tmp/matchday-english-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('translates errors and analysis navigation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('matchday:language', 'en'));
  await page.goto('/match/unknown');
  await expect(page.getByRole('alert')).toContainText('Match not found');
  await page.getByRole('button', { name: 'Match analysis', exact: true }).click();
  // While on a match, navigation keeps the current analysis. Use the dedicated picker route.
  await page.goto('/analyse');
  await expect(page.getByRole('heading', { name: 'Match analysis', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Team to analyse' }).click();
  await expect(page.getByRole('region', { name: 'Choose a team' })).toBeVisible();
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
  await expect(page.locator('.match-picker-row')).toHaveCount(1);
});

test('translates existing combination history without changing saved records', async ({ page }) => {
  const combos = [
    {
      id: 'language-history',
      savedAt: '2026-09-10T10:00:00Z',
      bookmaker: 'Unibet België',
      window: 5,
      minimumRate: 80,
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
          market: 'btts',
          decimal: 1.5,
          homeHits: 4,
          awayHits: 5,
          quoteUpdatedAt: null,
        })),
    },
  ];
  const raw = JSON.stringify({ version: 1, combos });
  await page.addInitScript((raw) => {
    localStorage.setItem('matchday:language', 'en');
    localStorage.setItem('matchday:combo-history:v1:demo', raw);
  }, raw);
  await page.goto('/combis');
  const history = page.getByRole('region', { name: 'Combination history', exact: true });
  await history.locator('summary').first().click();
  await expect(history.locator('.combo-heading')).toContainText('Pending');
  await expect(history).toContainText('Both teams to score');
  const download = page.waitForEvent('download');
  await history.getByRole('button', { name: 'Export history' }).click();
  expect((await download).suggestedFilename()).toBe('matchday-combination-history.json');
  expect(await page.evaluate(() => localStorage.getItem('matchday:combo-history:v1:demo'))).toBe(
    raw,
  );
});
