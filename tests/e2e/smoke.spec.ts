import { expect, test } from '@playwright/test';

test('shows the title menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'レース開始' })).toBeVisible();
  await expect(page.getByText('PCでプレイしてください')).toBeHidden();
});

test('can switch map from menu and start race', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.goto('/');
  const trackSelect = page.locator('#trackSelect');
  await expect(trackSelect).toBeVisible();
  await expect(trackSelect).toBeEnabled();
  await expect(trackSelect.locator('option')).toHaveCount(4);

  await trackSelect.selectOption('studio-gp-long-01');
  await expect(trackSelect).toHaveValue('studio-gp-long-01');
  const startButton = page.getByRole('button', { name: 'レース開始' });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await expect(page.getByRole('button', { name: 'pause' })).toBeVisible({ timeout: 12000 });
  await expect(trackSelect).toHaveValue('studio-gp-long-01');
});

test.describe('mobile', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });

  test('shows PC browser request and blocks race start in landscape', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'PCでプレイしてください' })).toBeVisible();
    await expect(page.getByText('スマホ版の開発は一旦停止中です')).toBeVisible();
    await expect(page.getByText('この端末ではレース開始を無効化しています。')).toBeVisible();

    const startButton = page.locator('#startButton');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    await expect(startButton).toHaveText('PCでプレイしてください');

    await expect(page.getByRole('button', { name: 'pause' })).toBeHidden();
    await expect(page.locator('#touchSteerZone')).toBeHidden();
    await expect(page.getByRole('button', { name: 'BOOST' })).toBeHidden();
  });

  test('keeps PC request visible when rotating between landscape and portrait', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'PCでプレイしてください' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'PCでプレイしてください' })).toBeVisible();
    await expect(page.locator('#startButton')).toBeDisabled();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'PCでプレイしてください' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'pause' })).toBeHidden();
  });
});

test.describe('mobile portrait title flow', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('shows PC browser request and blocks title start in portrait', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'PCでプレイしてください' })).toBeVisible();

    const startButton = page.locator('#startButton');
    const assistButton = page.locator('#assistLandscapeButton');

    await expect(startButton).toBeVisible();
    await expect(startButton).toBeDisabled();
    await expect(startButton).toHaveText('PCでプレイしてください');
    await expect(assistButton).toBeHidden();
    await expect(page.locator('#trackSelect')).toBeEnabled();
  });
});
