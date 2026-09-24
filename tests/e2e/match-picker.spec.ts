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
    league: { ...fixtures[1].league, id: 'test-league', name: 'Bundesliga' },
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
  const team = page.getByRole('button', { name: 'Ploeg voor analyse' });
  const panel = page.getByRole('region', { name: 'Kies een ploeg' });
  await expect(page.locator('.match-picker-row')).toHaveCount(2);
  await league.selectOption(fixtures[0].league.id);
  await team.click();
  await expect(panel.locator('.team-filter-option')).toHaveCount(3);
  await panel.getByRole('button', { name: fixtures[0].away.name, exact: true }).click();
  await expect(page.locator('.match-picker-row')).toHaveCount(1);
  await expect(page.locator('.match-picker-row')).toContainText(fixtures[0].away.name);
  await expect(league.locator('option[value="test-league"]')).toHaveText('Bundesliga');
  await league.selectOption('test-league');
  await expect(team).toContainText('Alle ploegen');
  await team.click();
  await expect(panel.locator('.team-filter-option')).toHaveCount(3);
  await expect(panel.getByRole('button', { name: fixtures[0].away.name, exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('.match-picker-row')).toContainText(fixtures[1].home.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await panel.getByRole('button', { name: fixtures[1].home.name, exact: true }).click();
  await page.getByLabel('Analysedatum').fill('2026-09-13');
  await expect(league).toHaveValue('');
  await expect(team).toContainText('Alle ploegen');
  await expect(team).toBeDisabled();
  await expect(
    page.getByText('Geen wedstrijden gevonden voor deze datum en filters.'),
  ).toBeVisible();
});

test('analysis team picker opens on desktop and narrow phones and clears the selection', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  await page.goto('/analyse');
  const team = page.getByRole('button', { name: 'Ploeg voor analyse' });
  const panel = page.getByRole('region', { name: 'Kies een ploeg' });
  await team.click();
  await panel.getByRole('button', { name: 'Arsenal', exact: true }).click();
  await expect(page.locator('.match-picker-row')).toHaveCount(1);
  await team.click();
  for (const width of info.project.name === 'mobile' ? [360, 390] : [1280]) {
    await page.setViewportSize({ width, height: 800 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await team.boundingBox())!.height).toBeLessThan(65);
    if (info.project.name === 'mobile') {
      const panelBox = (await panel.boundingBox())!;
      expect((await page.locator('.match-picker-row').boundingBox())!.y).toBeGreaterThanOrEqual(
        panelBox.y + panelBox.height,
      );
    }
    await page.screenshot({ path: `/tmp/analysis-team-picker-${width}.png` });
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(team).toBeFocused();
  await team.press('Enter');
  await panel.getByRole('button', { name: 'Alle ploegen', exact: true }).click();
  await expect(page.locator('.match-picker-row')).toHaveCount(4);
});
