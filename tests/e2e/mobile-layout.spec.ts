import { test, expect } from '@playwright/test';
for (const width of [360, 390])
  test(`phone layout at ${width}px keeps navigation and controls accessible`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'mobile', 'Phone-specific layout');
    await page.setViewportSize({ width, height: 800 });
    await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
    await page.goto('/');
    const nav = page.locator('.sidebar nav');
    await expect(nav).toHaveCSS('position', 'fixed');
    await expect(page.locator('.feature-banner')).not.toBeVisible();
    await expect(page.locator('.spotlight-card').first()).toBeVisible();
    const box = await nav.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(801);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `/tmp/mobile-home-${width}.png` });
    await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
    const explainer = page.locator('.combo-explainer');
    await expect(explainer).not.toHaveAttribute('open', '');
    await expect(page.getByLabel('Minimale doelodd')).toBeVisible();
    await explainer.locator('summary').click();
    await expect(explainer).toHaveAttribute('open', '');
    await explainer.locator('summary').click();
    await page
      .getByRole('button', { name: 'Doe een voorstel' })
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const action = await page.getByRole('button', { name: 'Doe een voorstel' }).boundingBox();
    const bottom = await nav.boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(bottom!.y);
    await page.screenshot({ path: `/tmp/mobile-combis-${width}.png` });
    await page.getByRole('button', { name: 'Matchanalyse', exact: true }).click();
    await page.locator('.match-picker-row').first().click();
    const table = page.getByLabel('Odds versus statistiek');
    await expect(table.locator('td:nth-child(3)').first()).not.toBeVisible();
    await page.getByRole('button', { name: 'Toon impliciete kans en modelverschil' }).click();
    await expect(table.locator('td:nth-child(3)').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Ons model', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Sluiten', exact: true }).click();
  });
