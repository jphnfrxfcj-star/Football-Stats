import { test, expect } from '@playwright/test';
import { demoFixtures } from '../../src/demo/data';
test('separate combinations page loads only on request and shows compact expandable proposals', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Combivoorstellen', exact: true }).click();
  await expect(page).toHaveURL(/\/combis$/);
  await expect(page.getByRole('heading', { name: 'Combivoorstellen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Doe een voorstel' })).toBeVisible();
  await expect(page.locator('.combo-card')).toHaveCount(0);
  const fixtures = demoFixtures('2026-09-12');
  await page.evaluate(
    async ({ fixtures, path }) => {
      const { api } = await import(path);
      api.markets = async () => ({
        window: 5,
        fixtures: fixtures.map((f) => ({ fixture: f, quotes: [] })),
        selections: fixtures.flatMap((f) =>
          ['over15', 'btts'].map((market) => ({
            id: `${f.id}:${market}`,
            fixture: f,
            market,
            label: market === 'btts' ? 'Beide teams scoren' : 'Over 1.5 goals',
            homeEvidence: [],
            awayEvidence: [],
            quotes: [
              {
                home: f.home.name,
                away: f.away.name,
                date: '2026-09-12',
                kickoff: f.kickoff,
                market,
                bookmaker: 'Unibet België',
                decimal: 1.5,
                updatedAt: null,
              },
            ],
          })),
        ),
        odds: {
          source: 'Test',
          kind: 'snapshot',
          fetchedAt: '2026-09-12T08:00:00Z',
          message: 'Sommige wedstrijden konden niet worden opgehaald.',
        },
      });
    },
    { fixtures, path: apiPath },
  );
  await page.getByLabel('Beoordeling combi').selectOption('history');
  await page.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(page.locator('.combo-finder-compact .combo-card')).toHaveCount(9);
  await expect(page.locator('.combo-finder').getByRole('status')).toHaveText(
    'Sommige wedstrijden konden niet worden opgehaald.',
  );
  const first = page.locator('.combo-card').first();
  await expect(first.locator('.compact-combo-legs')).toBeVisible();
  await expect(first.locator('.combo-evidence')).not.toHaveAttribute('open', '');
  await first.getByText('Historie en onderbouwing', { exact: true }).click();
  await expect(first.locator('.combo-evidence > ol')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `/tmp/combinations-page-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel('Minimale doelodd').fill('5');
  await expect(page.getByRole('alert')).toContainText('maximum');
  await page.getByLabel('Maximale doelodd').fill('7');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.combo-finder-compact .combo-card')).toHaveCount(9);
  await expect(page.locator('.combo-total').first()).toHaveText('×5.06');
  await page.getByLabel('Combi minimumfrequentie').selectOption('60');
  await expect(page.getByLabel('Combi minimumfrequentie')).toHaveValue('60');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Doe een voorstel' })).toBeVisible();
  await expect(page.locator('.combo-card')).toHaveCount(0);
});

test('match analysis navigation opens a fixture picker instead of model documentation', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Matchanalyse', exact: true }).click();
  await expect(page).toHaveURL(/\/analyse$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Ploeg voor analyse').selectOption({ label: 'Arsenal' });
  await expect(page.locator('.match-picker-row')).toHaveCount(1);
  await page.locator('.match-picker-row').click();
  await expect(page).toHaveURL(/\/match\//);
  await page.getByRole('button', { name: 'Ons model', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
