import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';

test('competition filters populate teams and reset dependent selections', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/');
  const fixtures = demoFixtures('2026-09-12').slice(0, 2);
  fixtures[1] = {
    ...fixtures[1],
    league: { ...fixtures[1].league, id: 'test-league', name: 'Test League' },
  };
  await page.evaluate(
    async ({ path, fixtures }) => {
      const { api } = await import(path);
      api.fixtures = async (date: string) => (date === '2026-09-12' ? fixtures : []);
    },
    { path: apiPath, fixtures },
  );
  await page.getByRole('button', { name: 'Matchanalyse', exact: true }).click();
  const league = page.getByLabel('Competitie voor analyse');
  const team = page.getByLabel('Ploeg voor analyse');
  await expect(page.locator('.match-picker-row')).toHaveCount(2);
  await league.selectOption(fixtures[0].league.id);
  await expect(team.locator('option')).toHaveCount(3);
  await team.selectOption(fixtures[0].away.id);
  await expect(page.locator('.match-picker-row')).toHaveCount(1);
  await expect(page.locator('.match-picker-row')).toContainText(fixtures[0].away.name);
  await league.selectOption('test-league');
  await expect(team).toHaveValue('');
  await expect(team.locator('option')).toHaveCount(3);
  await expect(page.locator('.match-picker-row')).toContainText(fixtures[1].home.name);
  await team.selectOption(fixtures[1].home.id);
  await page.getByLabel('Analysedatum').fill('2026-09-13');
  await expect(league).toHaveValue('');
  await expect(team).toHaveValue('');
  await expect(team).toBeDisabled();
  await expect(
    page.getByText('Geen wedstrijden gevonden voor deze datum en filters.'),
  ).toBeVisible();
});
