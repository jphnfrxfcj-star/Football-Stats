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
