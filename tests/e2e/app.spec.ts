import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-12T08:00:00Z'));
});
test('filters, navigates, explains probabilities and switches windows', async ({ page }) => {
  const errors: string[] = [];
  const matchRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/src/components/MatchPage.tsx')) matchRequests.push(request.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elke wedstrijd. Meer inzicht.' })).toBeVisible();
  await page.getByRole('button', { name: 'Filter op ploeg' }).click();
  await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Filter op ploeg' }).click();
  await page.getByRole('button', { name: 'Alle ploegen', exact: true }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(4);
  expect(matchRequests).toHaveLength(0);
  await page.locator('.fixture-row').first().click();
  await expect(page.getByRole('heading', { name: 'Kansen in één oogopslag' })).toBeVisible();
  expect(matchRequests).toHaveLength(1);
  await page.locator('.probability-card').nth(3).click();
  await expect(page.locator('.explanation')).toContainText('Beta(1,1)');
  await page.locator('#form').getByRole('button', { name: 'Laatste 20', exact: true }).click();
  await expect(page.locator('#form .panel-foot').first()).toContainText('20 / 20');
  await page.locator('#h2h').getByRole('button', { name: 'Laatste 10', exact: true }).click();
  await expect(page.locator('.h2h-row')).toHaveCount(10);
  await page.getByText('Bekijk de onderliggende wedstrijddata').click();
  await expect(page.locator('.raw-data pre')).toBeVisible();
  await page.getByRole('button', { name: 'Hoe werkt dit?' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('date changes and deep links work', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Wedstrijddatum').fill('2026-09-15');
  await expect(page.locator('.fixture-row')).toHaveCount(4);
  await page.locator('.fixture-row').first().click();
  await expect(page).toHaveURL(/demo-2026-09-15-0/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Arsenal', exact: true })).toBeVisible();
});
test('unknown fixture has a useful error state', async ({ page }) => {
  await page.goto('/match/not-a-fixture');
  await expect(page.getByRole('alert')).toContainText('Wedstrijd niet gevonden');
});

test('club crests load locally and failed images fall back to a shield', async ({ page }) => {
  await page.goto('/');
  const logos = page.locator('.fixture-row .team-badge img');
  await expect(logos).toHaveCount(8);
  await expect
    .poll(() =>
      logos.evaluateAll((images) =>
        images.every(
          (img) =>
            img instanceof HTMLImageElement &&
            img.complete &&
            img.naturalWidth > 0 &&
            img.getAttribute('src')?.startsWith('/clubs/'),
        ),
      ),
    )
    .toBe(true);
  await page.route('**/clubs/42.v1.png', (route) => route.abort());
  await page.reload();
  const arsenal = page.locator('.fixture-row .team-badge').first();
  await expect(arsenal.locator('svg')).toBeVisible();
  await expect(arsenal).toContainText('ARS');
});

test('spotlight links to its analysis and enrichment is clearly labelled in demo mode', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.spotlight-card')).toHaveCount(3);
  await expect(page.locator('.spotlight-card').first()).toContainText('Modelkans');
  await expect(page.locator('.spotlight-section .spotlight-note').first()).toContainText(
    'fictieve wedstrijden',
  );
  await page.getByRole('button', { name: 'Bekijk onderbouwing' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Spelerstatistieken', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Spelers bekijken' }).click();
  await expect(page.locator('#players')).toContainText('Geen spelerstatistieken beschikbaar');
  await expect(page.getByLabel('Bookmakervergelijking')).toContainText(
    'De demo bevat geen bookmakerodds',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('program shows 1X2 prices without the old historical combo section', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Odds en combibouwer' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Combi x2 tot x3' })).toBeVisible();
  const row = page.locator('.fixture-row').first();
  await expect(row.locator('.fixture-odd')).toHaveCount(3);
  await expect(row.locator('.fixture-odd small')).toHaveText(['1', 'X', '2']);
  await expect(row.locator('.fixture-odds')).toContainText('Geen odds beschikbaar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await row.click();
  await expect(page.getByLabel('Odds versus statistiek')).toBeVisible();
});

test('past programs show results without prematch price cells', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Wedstrijddatum').fill('2026-09-11');
  await expect(page.locator('.fixture-row').first()).toContainText('Uitslag volgt');
  await expect(page.locator('.fixture-odds')).toHaveCount(0);
});

test('Unibet analysis compares prices and builds a joint-history concept without multiplying odds', async ({
  page,
}) => {
  await page.goto('/match/demo-2026-09-14-0');
  const work = page.getByLabel('Odds versus statistiek');
  await expect(work.getByLabel('Analysebookmaker')).toHaveValue('Unibet België');
  await expect(work.locator('input')).toHaveCount(0);
  const row = work
    .locator('tbody tr')
    .filter({ has: page.getByLabel('Over 2.5 goals odd', { exact: true }) });
  await expect(row.getByLabel('Over 2.5 goals odd', { exact: true })).toHaveText('Geen prijs');
  await row.getByRole('button', { name: 'Toevoegen' }).click();
  await work
    .locator('tbody tr')
    .filter({ has: page.getByLabel('Beide teams scoren odd', { exact: true }) })
    .getByRole('button', { name: 'Toevoegen' })
    .click();
  const slip = work.getByLabel('Betbuilder concept');
  await expect(slip).toContainText('Gecombineerde prijs nog niet bevestigd');
  await slip.getByText('Bookmakerprijs toevoegen (optioneel)', { exact: true }).click();
  await slip.getByLabel('Gecombineerde bookmakerodd').fill('2,4');
  await expect(slip).toContainText('Totale odd 2.40');
  await slip.getByRole('button', { name: 'Verwijder Beide teams scoren' }).click();
  await expect(slip).not.toContainText('Totale odd');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('past dates and past match pages do not display odds or a builder', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Wedstrijddatum').fill('2026-09-11');
  await expect(page.getByRole('heading', { name: 'Uitslagen & terugblik' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Odds en combibouwer' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Spotlight' })).toHaveCount(0);
  await page.locator('.fixture-row').first().click();
  await expect(page.getByRole('heading', { name: 'Arsenal', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bookmakervergelijking' })).toHaveCount(0);
  await expect(page.getByLabel('Betbuilder concept')).toHaveCount(0);
});

test('multi-day x2-x3 finder remains visible on an empty program date', async ({ page }) => {
  let apiPath = '';
  page.on('request', (request) => {
    if (/\/src\/api\.ts(?:\?|$)/.test(request.url())) apiPath = request.url();
  });
  await page.goto('/');
  const finder = page.getByRole('region', { name: 'Combi x2 tot x3' });
  await expect(finder.getByRole('heading', { name: 'Combi x2–x3' })).toBeVisible();
  await expect(finder).toContainText('2026-09-12 t/m 2026-09-19');
  await expect(finder.getByLabel('Combiboekmaker')).toHaveValue('Unibet België');
  await expect(finder).toContainText('De combianalyse wordt pas dan geladen');
  await finder.getByRole('button', { name: 'Doe een voorstel' }).click();
  await expect(finder).toContainText('Geen passende combi');
  await finder.getByLabel('Combi historie').selectOption('10');
  await expect(finder).toContainText('laatste 10');
  await page.evaluate(async (path) => {
    const { api } = await import(path);
    api.fixtures = async () => [];
  }, apiPath);
  await page.getByLabel('Wedstrijddatum').fill('2026-09-13');
  await expect(page.getByText('Geen wedstrijden gevonden', { exact: true })).toBeVisible();
  await expect(finder).toBeVisible();
  await page.getByLabel('Wedstrijddatum').fill('2026-09-11');
  await expect(finder).toHaveCount(0);
});
