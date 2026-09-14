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
    let comparisonOnly = false;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      const r = await handler(new Request(route.request().url()), { ip: '127.0.0.1' } as never);
      let body = await r.text();
      if (comparisonOnly && route.request().url().endsWith('/odds') && r.ok) {
        const report = JSON.parse(body);
        report.quotes = report.quotes.filter(
          (q: { bookmaker: string }) => q.bookmaker !== 'Unibet België',
        );
        body = JSON.stringify(report);
      }
      await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body });
    });
    await page.goto('http://127.0.0.1:5174/match/free-fixture-2026-leeds-vs-newcastle');
    const work = page.getByLabel('Odds versus statistiek');
    await expect(work.getByLabel('Over 1.5 goals odd', { exact: true })).toHaveText(
      /^[0-9]+\.[0-9]{2}$/,
      { timeout: 60000 },
    );
    await expect(work.locator('input')).toHaveCount(0);
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
        unibetOver15: await work.getByLabel('Over 1.5 goals odd', { exact: true }).textContent(),
        errors,
      }),
    );
    comparisonOnly = true;
    await page.reload();
    await expect(work.getByLabel('Over 2.5 goals odd', { exact: true })).toHaveText(
      /^[0-9]+\.[0-9]{2}$/,
      { timeout: 60000 },
    );
    await expect(work.getByLabel('Analysebookmaker')).not.toHaveValue('Unibet België');
    await expect(work.getByRole('status')).toContainText('Geen Unibet-prijzen');
    await expect(work.locator('input')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
