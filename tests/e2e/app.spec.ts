import { test, expect } from '@playwright/test';
test('filters, navigates, explains probabilities and switches windows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elke wedstrijd. Meer inzicht.' })).toBeVisible();
  await page.getByPlaceholder('Zoek een team…').fill('arsenal');
  await expect(page.locator('.fixture-row')).toHaveCount(1);
  await page.getByPlaceholder('Zoek een team…').fill('unknown-team');
  await expect(page.getByText('Geen wedstrijden gevonden')).toBeVisible();
  await page.getByRole('button', { name: 'Filters herstellen' }).click();
  await expect(page.locator('.fixture-row')).toHaveCount(4);
  await page.locator('.fixture-row').first().click();
  await expect(page.getByRole('heading', { name: 'Kansen in één oogopslag' })).toBeVisible();
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
  await expect(page.locator('.spotlight-note').first()).toContainText('fictieve wedstrijden');
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

test('odds and combo section exposes sample settings and honest demo prices', async ({ page }) => {
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Odds en combibouwer' });
  await expect(section.getByRole('heading', { name: 'Odds & combi', exact: true })).toBeVisible();
  await expect(section).toContainText('Geen combi tussen 2 en 3');
  await expect(section.locator('tbody tr')).toHaveCount(4);
  await section.getByLabel('Historie').selectOption('10');
  await expect(section).toContainText('10/10 voor beide teams');
  await section.getByText(/Alle historische 100%-selecties/).click();
  await expect(section).toContainText('Selecties zonder bookmakerprijs');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('manual verified prices build a labelled same-book combo and can be removed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Wedstrijddatum').fill('2026-09-12');
  const section = page.getByRole('region', { name: 'Odds en combibouwer' });
  await section.getByLabel('Bookmaker voor handmatige odds').fill('Test bookmaker');
  await section.getByText(/Alle historische 100%-selecties/).click();
  await section.locator('.selection-evidence summary').nth(0).click();
  await section.locator('.selection-evidence summary').nth(1).click();
  await section.getByLabel('Handmatige odd Arsenal Over 0.5').fill('1,6');
  await section.getByLabel('Handmatige odd Manchester City Over 0.5').fill('1.6');
  await expect(section.locator('.combo-card')).toHaveCount(1);
  await expect(section.locator('.combo-card')).toContainText('Totale odd 2.56');
  await expect(section.locator('.combo-card').getByText(/Handmatig ingevoerd/)).toHaveCount(2);
  await section.getByLabel('Handmatige odd Arsenal Over 0.5').fill('');
  await expect(section.locator('.combo-card')).toHaveCount(0);
  await section.getByLabel('Handmatige odd Arsenal Over 0.5').fill('0.5');
  await expect(section.locator('.combo-card')).toHaveCount(0);
});

test('Unibet analysis compares prices and builds a joint-history concept without multiplying odds', async ({
  page,
}) => {
  await page.goto('/match/demo-2026-09-14-0');
  const work = page.getByLabel('Odds versus statistiek');
  await expect(work.getByLabel('Analysebookmaker')).toHaveValue('Unibet België');
  await work.getByLabel('Over 2.5 goals odd', { exact: true }).fill('2.0');
  const row = work
    .locator('tbody tr')
    .filter({ has: page.getByLabel('Over 2.5 goals odd', { exact: true }) });
  await expect(row).toContainText('50.0%');
  await row.getByRole('button', { name: 'Toevoegen' }).click();
  await work
    .locator('tbody tr')
    .filter({ has: page.getByLabel('Beide teams scoren odd', { exact: true }) })
    .getByRole('button', { name: 'Toevoegen' })
    .click();
  const slip = work.getByLabel('Betbuilder concept');
  await expect(slip).toContainText('Gecombineerde prijs nog niet bevestigd');
  await slip.getByLabel('Gecombineerde bookmakerodd').fill('2,4');
  await expect(slip).toContainText('Totale odd 2.40');
  await slip.getByRole('button', { name: 'Verwijder Beide teams scoren' }).click();
  await expect(slip).not.toContainText('Totale odd');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
