/** Real Belgian feed + database + browser check. Secrets must be supplied in the environment. */
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Server environment required');
process.env.DEMO_MODE = 'false';
process.env.VITE_DEMO_MODE = 'false';
process.env.FOOTBALL_PROVIDER = 'free-football';
const server = await createServer({ server: { port: 5174, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      const r = await handler(new Request(route.request().url()), { ip: '127.0.0.1' } as never);
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: await r.text(),
      });
    });
    await page.goto('http://127.0.0.1:5174');
    await page.getByLabel('Wedstrijddatum').fill('2026-09-14');
    const markets = page.getByRole('region', { name: 'Odds en combibouwer' });
    await expect(markets.getByLabel('Bookmaker', { exact: true })).toHaveValue('Unibet België', {
      timeout: 60000,
    });
    await expect(markets.locator('tbody tr')).toHaveCount(1);
    await page.locator('.fixture-row').first().click();
    const work = page.getByLabel('Odds versus statistiek');
    await expect(work.getByLabel('Over 1.5 goals odd', { exact: true })).not.toHaveAttribute(
      'placeholder',
      'Geen prijs',
      { timeout: 60000 },
    );
    await expect(work.getByLabel('Over 1.5 goals odd', { exact: true })).toBeVisible();
    await work
      .locator('tbody tr')
      .filter({ has: page.getByLabel('Over 1.5 goals odd', { exact: true }) })
      .getByRole('button', { name: 'Toevoegen' })
      .click();
    await work
      .locator('tbody tr')
      .filter({ has: page.getByLabel('Beide teams scoren odd', { exact: true }) })
      .getByRole('button', { name: 'Toevoegen' })
      .click();
    await expect(work.getByLabel('Betbuilder concept')).toContainText(
      'Gecombineerde prijs nog niet bevestigd',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await work.screenshot({ path: `/tmp/football-unibet-${width}.png` });
    console.log(
      JSON.stringify({
        width,
        unibetOver15: await work
          .getByLabel('Over 1.5 goals odd', { exact: true })
          .getAttribute('placeholder'),
        errors,
      }),
    );
    expect(errors).toEqual([]);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
