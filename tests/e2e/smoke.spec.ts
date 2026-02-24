import { expect, test } from '@playwright/test';

test('shows the title menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'レース開始' })).toBeVisible();
  await expect(page.getByText('横画面でプレイしてください')).toBeHidden();
});
