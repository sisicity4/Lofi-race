import { expect, test } from '@playwright/test';

test('shows the title menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'レース開始' })).toBeVisible();
  await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
});

test.describe('mobile', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
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

    await expect(joystick).toBeVisible();
    await expect(page.getByRole('button', { name: '◀' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '▶' })).toHaveCount(0);
    await expect(speedDial).toBeVisible();

    const box = await speedDial.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(844 * 0.55);
    expect(box!.y).toBeLessThan(390 * 0.4);
  });
});
