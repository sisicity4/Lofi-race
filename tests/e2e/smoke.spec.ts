import { expect, test } from '@playwright/test';

test('shows the title menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'レース開始' })).toBeVisible();
  await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
});

test('can switch map from menu and start race', async ({ page }) => {
  await page.goto('/');
  const trackSelect = page.locator('#trackSelect');
  await expect(trackSelect).toBeVisible();
  await expect(trackSelect.locator('option')).toHaveCount(4);

  await trackSelect.selectOption('studio-gp-long-01');
  await page.getByRole('button', { name: 'レース開始' }).click();

  await expect(page.getByRole('button', { name: 'pause' })).toBeVisible();
});

test.describe('mobile', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });

  test('can start race in landscape touch layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
    const startButton = page.getByRole('button', { name: 'レース開始' });
    await expect(startButton).toBeVisible();
    await startButton.click();

    await expect(page.getByRole('button', { name: 'pause' })).toBeVisible();
    await expect(startButton).toBeHidden();
  });

  test('shows joystick controls and top-right mini speed dial', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'レース開始' }).click();

    const joystick = page.locator('#touchSteerZone');
    const speedDial = page.locator('#speedDial');
    const overdriveHud = page.locator('#overdriveHud');

    await expect(joystick).toBeVisible();
    await expect(page.getByRole('button', { name: 'BOOST' })).toBeVisible();
    await expect(page.getByRole('button', { name: '◀' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '▶' })).toHaveCount(0);
    await expect(speedDial).toBeVisible();
    await expect(overdriveHud).toBeVisible();

    const box = await speedDial.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(844 * 0.55);
    expect(box!.y).toBeLessThan(390 * 0.4);
  });

  test('keeps race playable when rotating to portrait', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'レース開始' }).click();
    await expect(page.getByRole('button', { name: 'pause' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
    await expect(page.locator('#pausePanel')).toBeHidden();

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
    await expect(page.locator('#pausePanel')).toBeHidden();
  });
});

test.describe('mobile portrait title flow', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test('keeps title usable in portrait and allows start', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('横画面でプレイしてください')).toBeHidden();

    const startButton = page.locator('#startButton');
    const assistButton = page.locator('#assistLandscapeButton');

    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
    await expect(startButton).toHaveText('レース開始');
    await expect(assistButton).toBeVisible();
    await expect(page.locator('#trackSelect')).toBeEnabled();
  });

  test('can start race directly from portrait', async ({ page }) => {
    await page.goto('/');

    const startButton = page.locator('#startButton');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page.getByRole('button', { name: 'pause' })).toBeVisible();
  });
});
