import { expect, test } from '@playwright/test';
import { demoFixtures, demoMatch } from '../../src/demo/data';
import { buildMarkets } from '../../src/analysis/combinations';
import type { Fixture } from '../../src/domain/models';
const now = Date.parse('2026-09-12T00:00:00Z');

test('saves proposals only on request and retains saved state across pages', async ({ page }) => {
  await page.route('**/src/api.ts*', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /export const isDemo = .*?;/,
      'export const isDemo = false;',
    );
    await route.fulfill({ response, body });
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/api/results')
        ? { results: [], checkedAt: new Date(now).toISOString() }
        : [],
    }),
  );
  await page.clock.install({ time: new Date(now) });
  let workers = 0;
  page.on('worker', () => workers++);
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/');
  const fixtures = demoFixtures('2026-09-12').slice(0, 3);
  const matches = fixtures.map((fixture, index) => {
    const history = (side: 'home' | 'away') =>
      Array.from({ length: 20 }, (_, i): Fixture => {
        const team = fixture[side],
          opponent = { ...team, id: `opponent-${index}-${side}-${i}` };
        const hit = index < 2 || i < 4 || (i >= 5 && i % 3 === 0);
        return {
          ...fixture,
          id: `history-${index}-${side}-${i}`,
          status: 'finished',
          kickoff: new Date(now - (i + 1) * 7 * 86400000).toISOString(),
          home: i % 2 ? opponent : team,
          away: i % 2 ? team : opponent,
          homeGoals: hit ? 2 : 0,
          awayGoals: hit ? 2 : 0,
          halfHomeGoals: 1,
          halfAwayGoals: 0,
        };
      });
    return {
      ...demoMatch(fixture.id)!,
      fixture,
      homeHistory: history('home'),
      awayHistory: history('away'),
      h2h: [],
    };
  });
  const report = buildMarkets(
    matches,
    {
      kind: 'feed',
      source: 'Test',
      message: '',
      fetchedAt: new Date(now).toISOString(),
      quotes: fixtures.map((f) => ({
        home: f.home.name,
        away: f.away.name,
        date: '2026-09-12',
        kickoff: f.kickoff,
        market: 'btts',
        bookmaker: 'Unibet België',
        decimal: 1.6,
        updatedAt: new Date(now).toISOString(),
      })),
    },
    5,
    now,
    80,
  );
  await page.evaluate(
    async ({ path, report }) => {
      const { api } = await import(path);
      api.markets = async () => report;
      api.analysis = async () => {
        throw new Error('Testanalyse niet beschikbaar');
      };
    },
    { path: apiPath, report },
  );
  const finder = page.locator('.combo-finder');
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  const stored = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('matchday:combo-history:v1') ?? '{"combos":[]}').combos,
    );
  expect(await stored()).toHaveLength(0);
  await finder
    .getByRole('button', { name: 'Toevoegen aan favorieten', exact: true })
    .first()
    .click();
  await expect(
    finder.getByRole('button', { name: 'Verwijderen uit favorieten', exact: true }),
  ).toHaveCount(1);
  const original = await stored();
  expect(original).toHaveLength(1);
  await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
  await finder.getByLabel('Combi minimumfrequentie').selectOption('80');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(
    finder.getByRole('button', { name: 'Verwijderen uit favorieten', exact: true }),
  ).toHaveCount(1);
  expect(await stored()).toEqual(original);
  // Reading proposals must survive clock ticks without new searches or collapsed details.
  const evidence = finder.locator('.combo-card').last().locator('.combo-evidence');
  await evidence.locator('summary').first().click();
  await evidence.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  const workersBefore = workers;
  await page.clock.fastForward(60000);
  await expect(evidence).toHaveAttribute('open', '');
  expect(workers).toBe(workersBefore);
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(finder).toContainText('Momentopname van');
  // Return from a match to the same expanded proposal, without fetching markets again.
  const matchLink = evidence.getByRole('button').first();
  await matchLink.scrollIntoViewIfNeeded();
  const returnScroll = await page.evaluate(() => scrollY);
  await matchLink.click();
  await expect(page).toHaveURL(/\/match\//);
  await expect(page.getByRole('alert')).toContainText('Testanalyse niet beschikbaar');
  await page.goBack();
  await expect(page).toHaveURL(/\/combis$/);
  await expect(evidence).toHaveAttribute('open', '');
  expect(await page.evaluate(() => scrollY)).toBe(returnScroll);
  expect(workers).toBe(workersBefore);
  // A failed fetch and a failed worker both preserve the published snapshot.
  const snapshot = finder.getByText(/^Momentopname van/);
  const originalSnapshot = await snapshot.textContent();
  const evidenceTop = (await evidence.boundingBox())!.y;
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    (window as any).originalMarkets = api.markets;
    api.markets = () =>
      new Promise((_resolve, reject) => {
        (window as any).failRefresh = reject;
      });
  }, apiPath);
  await finder
    .getByRole('button', { name: 'Combi zoeken / verversen' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(finder.getByRole('button', { name: 'Combi zoeken / verversen' })).toBeDisabled();
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(evidence).toHaveAttribute('open', '');
  await expect(snapshot).toHaveText(originalSnapshot!);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect.poll(async () => (await evidence.boundingBox())!.y).toBeCloseTo(evidenceTop, 0);
  await page.evaluate(() => (window as any).failRefresh(new Error('Tijdelijke bronuitval')));
  await expect(finder.getByRole('alert')).toContainText('Tijdelijke bronuitval');
  await expect.poll(async () => (await evidence.boundingBox())!.y).toBeCloseTo(evidenceTop, 0);
  await expect(evidence).toHaveAttribute('open', '');
  await expect(snapshot).toHaveText(originalSnapshot!);
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.markets = (window as any).originalMarkets;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct() {
        window.Worker = NativeWorker;
        throw new Error('Test worker failure');
      },
    });
  }, apiPath);
  await finder
    .getByRole('button', { name: 'Combi zoeken / verversen' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(finder.getByRole('alert')).toContainText('Combivoorstellen berekenen is mislukt');
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  await expect(evidence).toHaveAttribute('open', '');
  await expect(snapshot).toHaveText(originalSnapshot!);
  await finder.getByRole('button', { name: 'Combi zoeken / verversen' }).click();
  await expect.poll(() => workers).toBeGreaterThan(workersBefore);
  await expect(finder.locator('.combo-card')).toHaveCount(3);
  const history = page.locator('.combo-history');
  await history.locator('summary').first().click();
  const favorite = history.getByRole('button', { name: 'Verwijderen uit favorieten', exact: true });
  await expect(favorite).toBeVisible();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  const heading = history.locator('.combo-heading');
  const price = await heading.locator('.combo-total').boundingBox();
  const star = await favorite.boundingBox();
  expect(star!.x).toBeGreaterThan(price!.x + price!.width);
  await page.screenshot({
    path: `/tmp/combo-history-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  await favorite.click();
  expect(await stored()).toHaveLength(0);
  await expect(
    finder.getByRole('button', { name: 'Toevoegen aan favorieten', exact: true }),
  ).toHaveCount(3);
  await page.clock.fastForward(60000);
  expect(await stored()).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
