/** Real multi-day combo smoke test; server secrets only in process environment. */
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Server environment required');
process.env.DEMO_MODE = 'false';
process.env.VITE_DEMO_MODE = 'false';
const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const p = await browser.newPage({ viewport: { width, height: 1000 } }),
      errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/api/**', async (route) => {
      const r = await handler(new Request(route.request().url()), { ip: '127.0.0.1' } as never);
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: await r.text(),
      });
    });
    await p.goto('http://127.0.0.1:5174');
    const finder = p.getByRole('region', { name: 'Combi x2 tot x3' });
    await expect(finder.getByRole('heading', { name: 'Combi x2–x3' })).toBeVisible();
    await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
    await expect(finder.locator('.combo-card').first()).toBeVisible({ timeout: 90000 });
    const totals = await finder.locator('.combo-total').allTextContents();
    expect(
      totals.every((t) => Number(t.replace('×', '')) >= 2 && Number(t.replace('×', '')) <= 3),
    ).toBe(true);
    await finder.locator('.finder-leg details summary').first().click();
    await expect(finder.locator('.finder-leg details').first()).toContainText('2026-');
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await finder.screenshot({ path: `/tmp/football-combo-${width}.png` });
    console.log(JSON.stringify({ width, totals, errors }));
    expect(errors).toEqual([]);
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
