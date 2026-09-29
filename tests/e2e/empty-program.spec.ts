import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';

test('empty program keeps actions beside each other and clears filters without changing the date', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/combis');
  await page.evaluate(
    async ({ path, fixtures }) => {
      const { api } = await import(path);
      api.fixtures = async (date: string) => (date === '2026-09-12' ? fixtures : []);
      api.leagues = async () => [
        fixtures[0].league,
        { ...fixtures[0].league, id: 'empty-league', name: 'La Liga' },
      ];
    },
    { path: apiPath, fixtures: demoFixtures('2026-09-12') },
  );
  await page.getByRole('button', { name: 'Wedstrijden', exact: true }).click();
  await page.getByLabel('Wedstrijddatum').fill('2026-09-13');
  await page.getByLabel('Filter op competitie').selectOption('empty-league');
  const empty = page.locator('.program-empty');
  await empty.getByRole('button', { name: 'Filters wissen' }).click();
  await expect(page.getByLabel('Wedstrijddatum')).toHaveValue('2026-09-13');
  await expect(page.getByLabel('Filter op competitie')).toHaveValue('all');
  await expect(empty.getByRole('button', { name: 'Filters wissen' })).toHaveCount(0);
  for (const width of info.project.name === 'mobile' ? [360, 390] : [1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const language of ['nl', 'en']) {
      await page.locator('.language-control select').selectOption(language);
      await empty.scrollIntoViewIfNeeded();
      const buttons = empty.getByRole('button');
      await expect(buttons).toHaveCount(2);
      const a = (await buttons.nth(0).boundingBox())!;
      const b = (await buttons.nth(1).boundingBox())!;
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
      expect(a.x + a.width).toBeLessThan(b.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `/tmp/empty-program-${width}-${language}.png` });
    }
  }
  await empty.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByLabel('Match date')).toHaveValue('2026-09-14');
  await empty.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByLabel('Match date')).toHaveValue('2026-09-12');
  await expect(page.locator('.fixture-row')).toHaveCount(4);
});
