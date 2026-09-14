/** Public deployment smoke test. Set PLAYER_CHECK_MATCHES to comma-separated upcoming fixture IDs. */
import { chromium, expect } from '@playwright/test';
const ids = (
  process.env.PLAYER_CHECK_MATCHES ??
  'free-fixture-2026-leeds-vs-newcastle,free-fixture-2026-villarreal-vs-betis'
).split(',');
const browser = await chromium.launch();
try {
  for (const [index, id] of ids.entries()) {
    const width = index % 2 ? 390 : 1440;
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`https://matchday-be.netlify.app/match/${encodeURIComponent(id)}`);
    await page.getByRole('button', { name: 'Spelers bekijken' }).click({ timeout: 60000 });
    await expect(page.locator('#players tbody tr').first()).toBeVisible({ timeout: 90000 });
    const counts = [];
    for (let team = 0; team < 2; team++) {
      await page.locator('#players .window-tabs button').nth(team).click();
      await page.getByLabel('Sorteer spelers').selectOption('shotsOnTarget');
      await page.getByLabel('Spelerstatistieken weergave').selectOption('total');
      const count = await page.locator('#players tbody tr').count();
      expect(count).toBeGreaterThan(10);
      counts.push(count);
      await expect(page.locator('#players tbody tr').first()).not.toContainText('n=0');
      await page.getByLabel('Sorteer spelers').selectOption('foulsCommitted');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await page.locator('#players').screenshot({ path: `/tmp/players-live-${width}.png` });
    console.log(JSON.stringify({ id, width, counts, errors }));
    await page.close();
  }
} finally {
  await browser.close();
}
