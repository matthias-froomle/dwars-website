import { expect, test } from './fixtures.mjs';
import { gotoPath, publicOnly, visibleThemeToggle } from './support.mjs';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

async function expectTheme(page, theme, stored) {
  if (theme === 'dark') {
    await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(34, 34, 34)');
  }
  else {
    await expect(page.locator('html')).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  expect(await page.evaluate(() => localStorage.getItem('dwars-theme'))).toBe(stored);
  await expect(page.locator('[data-dwars-theme-toggle]').first()).toHaveAttribute('aria-pressed', String(theme === 'dark'));
}

test.describe('Automatic and manual theme selection', () => {
  test.skip(publicOnly, 'DWARS_AUTH_ONLY runs only authenticated editorial checks.');

  for (const viewport of viewports) {
    test(`${viewport.name}: follows the system preference without a saved choice`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: 'dark' });
      await gotoPath(page, '/nl');
      await expectTheme(page, 'dark', null);

      await page.emulateMedia({ colorScheme: 'light' });
      await page.reload({ waitUntil: 'load' });
      await expectTheme(page, 'light', null);
    });

    test(`${viewport.name}: persists manual light and dark choices`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: 'light' });
      await gotoPath(page, '/nl');

      let toggle = await visibleThemeToggle(page, viewport.mobile);
      await expect(toggle).toHaveCount(1);
      await toggle.click();
      await expectTheme(page, 'dark', 'dark');

      await page.reload({ waitUntil: 'load' });
      await expectTheme(page, 'dark', 'dark');

      toggle = await visibleThemeToggle(page, viewport.mobile);
      await toggle.click();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.reload({ waitUntil: 'load' });
      await expectTheme(page, 'light', 'light');
    });
  }
});
