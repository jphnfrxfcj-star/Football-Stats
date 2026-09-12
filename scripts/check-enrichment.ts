/** Real-data smoke test. Requires server-side Supabase env vars, never writes credentials. */
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.');
process.env.DEMO_MODE = 'false';
process.env.VITE_DEMO_MODE = 'false';
process.env.FOOTBALL_PROVIDER = 'free-football';
const server = await createServer({ server: { port: 5174, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      const response = await handler(new Request(route.request().url()), {
        ip: '127.0.0.1',
      } as never);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto('http://127.0.0.1:5174');
    await page.getByLabel('Wedstrijddatum').fill('2026-09-12');
    await expect(page.locator('.fixture-row')).toHaveCount(7, { timeout: 30000 });
    await expect(page.locator('.spotlight-card')).toHaveCount(3, { timeout: 30000 });
    await expect(page.locator('.spotlight-card .spotlight-prices').first()).not.toContainText('—');
    await page
      .locator('.spotlight-section')
      .screenshot({ path: `/tmp/football-spotlight-${width}.png` });
    const markets = page.getByRole('region', { name: 'Odds en combibouwer' });
    await expect(markets.locator('tbody tr')).toHaveCount(7, { timeout: 30000 });
    await expect(markets.getByLabel('Bookmaker', { exact: true }).locator('option')).toHaveCount(6);
    await markets.getByText(/Alle historische 100%-selecties/).click();
    await expect(markets.locator('.selection-evidence').first()).toBeVisible();
    await markets.locator('.selection-evidence summary').first().click();
    await expect(markets.locator('.manual-price input').first()).toBeVisible();
    await markets.screenshot({ path: `/tmp/football-markets-${width}.png` });
    await page.goto('http://127.0.0.1:5174/match/free-fixture-2026-crystal-palace-vs-ipswich');
    await page.getByRole('button', { name: 'Spelers bekijken' }).click({ timeout: 30000 });
    await expect(page.locator('#players .player-table tbody tr').first()).toBeVisible({
      timeout: 60000,
    });
    await page.getByLabel('Sorteer spelers').selectOption('foulsCommitted');
    await page.getByLabel('Spelerstatistieken weergave').selectOption('total');
    await page.locator('#players .window-tabs button').nth(1).click();
    await expect(page.locator('#players .player-table tbody tr').first()).toBeVisible();
    await page.locator('#players').screenshot({ path: `/tmp/football-players-${width}.png` });
    await expect(page.locator('.odds-section .player-table tbody tr').first()).toBeVisible({
      timeout: 30000,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        width,
        spotlight: true,
        playerRows: await page.locator('#players tbody tr').count(),
        bookmakers: await page.locator('.odds-section tbody tr').count(),
        errors,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
