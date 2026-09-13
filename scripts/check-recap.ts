/** Real database smoke check. Requires Supabase credentials in process variables only. */
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Server environment required');
process.env.DEMO_MODE = 'false';
process.env.VITE_DEMO_MODE = 'false';
process.env.FOOTBALL_PROVIDER = 'free-football';
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      requests.push(route.request().url());
      const r = await handler(new Request(route.request().url()), { ip: '127.0.0.1' } as never);
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: await r.text(),
      });
    });
    await page.goto('http://127.0.0.1:5174');
    await page.getByLabel('Wedstrijddatum').fill('2026-09-12');
    await expect(page.locator('.fixture-row')).toHaveCount(11, { timeout: 60000 });
    await expect(page.getByRole('region', { name: 'Dagrecap' })).toContainText('11');
    await expect(page.getByRole('region', { name: 'Odds en combibouwer' })).toHaveCount(0);
    expect(requests.some((u) => /\/(markets|spotlight)\?date=2026-09-12/.test(u))).toBe(false);
    await page.getByLabel('Filter op competitie').selectOption('free-league-sp1');
    await expect(page.locator('.fixture-row')).toHaveCount(4);
    await page
      .getByRole('region', { name: 'Dagrecap' })
      .screenshot({ path: `/tmp/football-day-recap-${width}.png` });
    requests.length = 0;
    await page.locator('.fixture-row').first().click();
    await expect(page.getByRole('region', { name: 'Wedstrijdrecap' })).toContainText(
      'Wat is uitgekomen?',
      { timeout: 60000 },
    );
    await expect(page.getByRole('region', { name: 'Bookmakervergelijking' })).toHaveCount(0);
    expect(requests.some((u) => u.endsWith('/odds'))).toBe(false);
    await page
      .getByRole('region', { name: 'Wedstrijdrecap' })
      .screenshot({ path: `/tmp/football-recap-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.goto('http://127.0.0.1:5174/match/free-fixture-2026-villarreal-vs-betis');
    await expect(
      page.getByLabel('Odds versus statistiek').getByLabel('Over 1.5 goals odd', { exact: true }),
    ).not.toHaveAttribute('placeholder', 'Geen prijs', { timeout: 60000 });
    console.log(JSON.stringify({ width, recap: true, spanishOdds: true, errors }));
    expect(errors).toEqual([]);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
