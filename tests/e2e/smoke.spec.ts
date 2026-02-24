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
});
