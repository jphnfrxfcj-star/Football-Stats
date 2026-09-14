/** Real program odds and responsive layout. Server credentials must stay in process environment. */
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import handler from '../netlify/functions/api';
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('Server environment required');
process.env.DEMO_MODE = 'false';
process.env.VITE_DEMO_MODE = 'false';
const server = await createServer({ server: { port: 5174, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const p = await browser.newPage({ viewport: { width, height: 900 } });
    const requests: string[] = [];
    await p.route('**/api/**', async (route) => {
      requests.push(route.request().url());
      const r = await handler(new Request(route.request().url()), { ip: '127.0.0.1' } as never);
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: await r.text(),
      });
    });
    await p.goto('http://127.0.0.1:5174');
    const row = p.locator('.fixture-row.has-odds').first();
    await expect(row.locator('.fixture-odd strong').first()).toHaveText(/^[0-9]+\.[0-9]{2}$/, {
      timeout: 60000,
    });
    await expect(p.getByRole('region', { name: 'Odds en combibouwer' })).toHaveCount(0);
    expect(requests.filter((u) => u.includes('/api/odds?'))).toHaveLength(1);
    expect(
      requests.filter((u) => u.includes('/api/markets?') && !u.includes('days=8')),
    ).toHaveLength(0);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.locator('.fixture-group').screenshot({ path: `/tmp/program-odds-${width}.png` });
    console.log(
      JSON.stringify({
        width,
        prices: await row.locator('.fixture-odd strong').allTextContents(),
        book: await row.locator('.fixture-odds-caption').textContent(),
      }),
    );
    await row.click();
    await expect(p.getByRole('heading', { name: 'Bookmakerodds', exact: true })).toBeVisible({
      timeout: 60000,
    });
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
