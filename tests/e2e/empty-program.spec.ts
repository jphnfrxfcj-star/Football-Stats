import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';

test('empty program keeps actions beside each other and clears a stale filter without changing the date', async ({
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
      (window as any).emptyProgram = false;
      api.fixtures = async (date: string) =>
        date === '2026-09-12' && !(window as any).emptyProgram ? fixtures : [];
    },
    { path: apiPath, fixtures: demoFixtures('2026-09-12') },
  );
  await page.getByRole('button', { name: 'Wedstrijden', exact: true }).click();
  await page
    .getByLabel('Filter op competitie')
    .selectOption(demoFixtures('2026-09-12')[0].league.id);
  await page.evaluate(() => {
    (window as any).emptyProgram = true;
  });
  await page.getByRole('button', { name: 'Programma bijwerken' }).click();
  const empty = page.locator('.program-empty');
  await expect(empty).toBeVisible();
  await empty.getByRole('button', { name: 'Filters wissen' }).click();
  await expect(page.getByLabel('Wedstrijddatum')).toHaveValue('2026-09-12');
  await expect(page.getByLabel('Filter op competitie')).toHaveValue('all');
  await expect(empty.getByRole('button', { name: 'Filters wissen' })).toHaveCount(0);
  await page.getByLabel('Wedstrijddatum').fill('2026-09-13');
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
  const emptyMessage = await empty.innerText();
  await empty.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByLabel('Match date')).toHaveValue('2026-09-14');
  await page.evaluate(() => {
    (window as any).emptyProgram = false;
  });
  await empty.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByLabel('Match date')).toHaveValue('2026-09-12');
  await expect(page.locator('.fixture-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Match analysis', exact: true }).click();
  await page.getByLabel('Analysis date').fill('2026-09-13');
  await expect(empty).toHaveText(emptyMessage, { useInnerText: true });
  for (const width of info.project.name === 'mobile' ? [360, 390] : [1280]) {
    await page.setViewportSize({ width, height: 800 });
    await empty.scrollIntoViewIfNeeded();
    const buttons = empty.getByRole('button');
    const first = (await buttons.nth(0).boundingBox())!;
    const second = (await buttons.nth(1).boundingBox())!;
    expect(Math.abs(first.y - second.y)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `/tmp/empty-analysis-${width}.png` });
  }
  await empty.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByLabel('Analysis date')).toHaveValue('2026-09-14');
  await empty.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByLabel('Analysis date')).toHaveValue('2026-09-12');
  await expect(page.locator('.match-picker-row')).toHaveCount(4);
});
