import { test, expect } from '@playwright/test';

// Hold actual source promises instead of relying on wall-clock latency or live feeds.
// The demo module still supplies the fixtures and model cards used by the UI.
async function holdHomepageSources(page: import('@playwright/test').Page) {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  await page.route('**/src/api.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
const originalFixtures = api.fixtures;
const originalSpotlight = api.spotlight;
window.homepageSources = { fixtureResolvers: [], spotlightResolvers: [], metadataCalls: 0, failRefresh: false };
api.leagues = () => {
  window.homepageSources.metadataCalls++;
  return new Promise(() => {});
};
api.fixtures = async (...args) => {
  if (window.homepageSources.failRefresh) throw new Error('Programma tijdelijk onbereikbaar');
  await new Promise(resolve => window.homepageSources.fixtureResolvers.push({ date: args[0], resolve }));
  if (window.homepageSources.failRefresh) throw new Error('Programma tijdelijk onbereikbaar');
  return originalFixtures(...args);
};
api.spotlight = async (...args) => {
  await new Promise(resolve => window.homepageSources.spotlightResolvers.push(resolve));
  return originalSpotlight(...args);
};
`,
    });
  });
}

for (const narrow of [false, true]) {
  test(`homepage releases fixtures independently and keeps their position${narrow ? ' at 360px' : ''}`, async ({
    page,
  }, info) => {
    test.skip(narrow && info.project.name !== 'mobile', 'Extra narrow phone coverage');
    if (narrow) await page.setViewportSize({ width: 360, height: 800 });
    await holdHomepageSources(page);
    await page.goto('/');
    await expect(page.getByRole('status', { name: 'Programma laden…' })).toBeVisible();
    await expect(page.locator('.fixture-row')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() =>
      (window as any).homepageSources.fixtureResolvers.forEach((r: any) => r.resolve()),
    );
    const row = page.locator('.fixture-row').first();
    await expect(row).toBeVisible();
    await expect(page.getByRole('status', { name: 'Programma laden…' })).toHaveCount(0);
    await expect(page.getByLabel('Filter op competitie').locator('option')).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Spotlight' })).toContainText(
      'Spotlight wordt berekend',
    );
    expect(await page.evaluate(() => (window as any).homepageSources.metadataCalls)).toBe(0);
    const top = await row.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate(() =>
      (window as any).homepageSources.spotlightResolvers.forEach((resolve: any) => resolve()),
    );
    await expect(page.locator('.spotlight-card').first()).toBeVisible();
    expect(await row.evaluate((el) => el.getBoundingClientRect().top + scrollY)).toBe(top);
    await page.evaluate(() => {
      (window as any).homepageSources.failRefresh = true;
    });
    await page.getByRole('button', { name: 'Programma bijwerken', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'De eerder geladen gegevens blijven zichtbaar.',
    );
    await expect(row).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Programma bijwerken', exact: true }),
    ).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('changing dates while the first program loads ignores the earlier response', async ({
  page,
}) => {
  await holdHomepageSources(page);
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Programma laden…' })).toBeVisible();
  await page.getByRole('button', { name: 'Volgende dag', exact: true }).click();
  await expect(page.getByLabel('Wedstrijddatum')).toHaveValue('2026-09-13');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).homepageSources.fixtureResolvers.some((r: any) => r.date === '2026-09-13'),
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as any).homepageSources.fixtureResolvers
      .filter((r: any) => r.date === '2026-09-13')
      .forEach((r: any) => r.resolve()),
  );
  await expect(page.locator('.fixture-row').first()).toBeVisible();
  const fixtures = await page.locator('.fixture-row').allTextContents();
  await page.evaluate(() =>
    (window as any).homepageSources.fixtureResolvers
      .filter((r: any) => r.date === '2026-09-12')
      .forEach((r: any) => r.resolve()),
  );
  await expect(page.getByLabel('Wedstrijddatum')).toHaveValue('2026-09-13');
  await expect(page.locator('.fixture-row')).toHaveText(fixtures);
});

test('an initial source error remains retryable and is not counted as a usable program', async ({
  page,
}) => {
  await holdHomepageSources(page);
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Programma laden…' })).toBeVisible();
  await page.evaluate(() => {
    (window as any).homepageSources.failRefresh = true;
    (window as any).homepageSources.fixtureResolvers.forEach((r: any) => r.resolve());
  });
  await expect(page.getByRole('button', { name: 'Opnieuw proberen', exact: true })).toBeVisible();
  await expect(page.locator('.fixture-row')).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).homepageSources.failRefresh = false;
    (window as any).homepageSources.fixtureResolvers = [];
  });
  await page.getByRole('button', { name: 'Opnieuw proberen', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Programma laden…' })).toBeVisible();
  await page.evaluate(() =>
    (window as any).homepageSources.fixtureResolvers.forEach((r: any) => r.resolve()),
  );
  await expect(page.locator('.fixture-row').first()).toBeVisible();
});

test('records one browser metric when the home document opens', async ({ page }) => {
  // Playwright's fixed clock replaces PerformanceNavigationTiming, so verify this
  // separately under the real browser clock.
  await page.goto('/');
  await expect(page.locator('.fixture-row').first()).toBeVisible();
  expect(
    await page.evaluate(
      () => performance.getEntriesByName('matchday:initial-program', 'measure').length,
    ),
  ).toBe(1);
});
