import { test, expect } from '@playwright/test';

test('section history restores the reading position on back and forward', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  await page.goto('/analyse');
  await page.locator('.match-picker-row').first().click();
  await expect(page.locator('.match-hero')).toBeVisible();
  await page.getByRole('link', { name: 'Recente vorm', exact: true }).click();
  await expect(page).toHaveURL(/#form$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  // Keep a reading position below the anchor, rather than merely testing the URL.
  await page.evaluate(() => window.scrollBy(0, 180));
  const readingPosition = await page.evaluate(() => scrollY);
  await page.goBack();
  await expect(page).toHaveURL(/\/match\/[^#]+$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goForward();
  await expect(page).toHaveURL(/#form$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(readingPosition);
  // Repeated traversal must reuse the same history entry and its saved position.
  await page.goBack();
  await page.goForward();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(readingPosition);
  await page.getByRole('button', { name: 'Terug naar overzicht' }).click();
  await expect(page).toHaveURL(/\/analyse$/);
  await expect(page.locator('.match-picker-row').first()).toBeVisible();
});

test('back restores filters, details and scroll; revisiting analysis reuses data', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/analyse');
  await expect(page.locator('.match-picker-row').first()).toBeVisible();
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    const original = api.analysis;
    (window as any).analysisReads = 0;
    api.analysis = (...args: any[]) => {
      (window as any).analysisReads++;
      return original(...args);
    };
  }, apiPath);
  await page.getByRole('button', { name: 'Ploeg voor analyse' }).click();
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
  const row = page.locator('.match-picker-row:visible');
  await expect(row).toHaveCount(1);
  await row.scrollIntoViewIfNeeded();
  const previousScroll = await page.evaluate(() => scrollY);
  await row.click();
  await expect(
    page.getByRole('button', { name: 'Analyse en odds bijwerken', exact: true }),
  ).toBeVisible();
  const reads = await page.evaluate(() => (window as any).analysisReads);
  await page.getByRole('link', { name: 'Recente vorm', exact: true }).click();
  await page.getByRole('button', { name: 'Terug naar overzicht' }).click();
  await expect(page).toHaveURL(/\/analyse$/);
  await expect(row).toHaveCount(1);
  expect(await page.evaluate(() => scrollY)).toBe(previousScroll);
  await row.click();
  await expect(
    page.getByRole('button', { name: 'Analyse en odds bijwerken', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).analysisReads)).toBe(reads);
  await page.getByRole('button', { name: 'Analyse en odds bijwerken', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).analysisReads)).toBe(reads + 1);
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.analysis = async () => {
      throw new Error('Testuitval');
    };
  }, apiPath);
  await page.getByRole('button', { name: 'Analyse en odds bijwerken', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Testuitval');
  await expect(page.locator('.match-hero:visible')).toBeVisible();
  await page.goBack();
  await expect(row).toHaveCount(1);
  await page.goForward();
  await expect(page.locator('.match-hero:visible')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
