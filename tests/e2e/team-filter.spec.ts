import { expect, test } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';

test('chooses actual teams by league and date without text input or extra data requests', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/combis');
  const fixtures = demoFixtures('2026-09-12').slice(0, 2);
  fixtures[1] = {
    ...fixtures[1],
    league: { ...fixtures[1].league, id: 'second', name: 'La Liga' },
  };
  await page.evaluate(
    async ({ path, fixtures }) => {
      const { api } = await import(path);
      api.fixtures = async (date: string) => (date === '2026-09-12' ? fixtures : []);
      api.leagues = async () => fixtures.map((f) => f.league);
    },
    { path: apiPath, fixtures },
  );
  await page.getByRole('button', { name: 'Wedstrijden', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Filter op ploeg' });
  const panel = page.getByRole('region', { name: 'Kies een ploeg' });
  await expect(page.locator('.fixture-row')).toHaveCount(2);
  await expect(page.locator('.filters input[type="text"]')).toHaveCount(0);
  // Filtering must use loaded fixtures, even if the API becomes unavailable.
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.leagues = async () => {
      throw new Error('Unexpected refetch');
    };
  }, apiPath);
  await trigger.click();
  await expect(panel.getByRole('group')).toHaveCount(2);
  await panel.getByRole('button', { name: fixtures[0].away.name, exact: true }).click();
  await expect(trigger).toContainText(fixtures[0].away.name);
  await expect(trigger).toBeFocused();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await expect(page.locator('.fixture-row')).toContainText(fixtures[0].away.name);
  await page.getByLabel('Filter op competitie').selectOption('second');
  await expect(trigger).toContainText('Alle ploegen');
  await trigger.click();
  await expect(panel.getByRole('group')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: fixtures[0].away.name, exact: true })).toHaveCount(
    0,
  );
  await panel.getByRole('button', { name: fixtures[1].home.name, exact: true }).click();
  await expect(page.locator('.fixture-row')).toContainText(fixtures[1].home.name);
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.leagues = async () => [];
  }, apiPath);
  await page.getByLabel('Wedstrijddatum').fill('2026-09-13');
  await expect(page.getByLabel('Filter op competitie')).toHaveValue('all');
  await expect(trigger).toContainText('Alle ploegen');
  await expect(trigger).toBeDisabled();
  await expect(page.getByText('Geen wedstrijden gevonden', { exact: true })).toBeVisible();
});

test('team chooser supports keyboard, dismissal and narrow layouts', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Filter op ploeg' });
  const panel = page.getByRole('region', { name: 'Kies een ploeg' });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Sluiten' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Alle ploegen' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Arsenal', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toContainText('Arsenal');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(panel.getByRole('button', { name: 'Arsenal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await trigger.boundingBox())!.height).toBeLessThan(65);
  if (info.project.name === 'mobile') {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await panel.scrollIntoViewIfNeeded();
      const panelBox = (await panel.boundingBox())!;
      const fixtureBox = (await page.locator('.fixture-row').first().boundingBox())!;
      expect(fixtureBox.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
      expect((await trigger.boundingBox())!.height).toBeLessThan(65);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `/tmp/team-filter-mobile-${width}.png` });
    }
  } else {
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/team-filter-desktop.png` });
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByLabel('Filter op competitie').click();
  await expect(panel).toHaveCount(0);
});
