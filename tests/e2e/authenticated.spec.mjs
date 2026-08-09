import { expect, test } from './fixtures.mjs';
import { authenticatedRoutes, gotoPath } from './support.mjs';

const loginUrl = process.env.DWARS_LOGIN_URL;

test.describe('Authenticated editorial tools', () => {
  test.skip(!loginUrl, 'Set DWARS_LOGIN_URL to run authenticated route checks.');

  test('keeps the DWARS shell around editor-only Views', async ({ page }) => {
    await page.goto(loginUrl, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('dwars-theme', 'dark'));

    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000, mobile: false },
      { name: 'phone', width: 390, height: 844, mobile: true },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of authenticatedRoutes) {
        await test.step(`${viewport.name}: ${route.name}`, async () => {
          const response = await gotoPath(page, route.path);
          expect(response?.status()).toBe(200);
          await expect(page.locator('.dwars-editorial-tool')).toBeAttached();
          await expect(page.locator('#toolbar-administration')).toBeAttached();
          await expect(page.locator('.dwars-copyright-corner')).toHaveCount(1);
          expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
          if (viewport.mobile) {
            await expect(page.locator('.dwars-mobile-header')).toBeVisible();
          }
          else {
            await expect(page.locator('.dwars-desktop-sidebar')).toBeVisible();
          }
          if (route.name === 'photographers') {
            await expect(page.locator('main input[type="submit"][value="Toepassen"]')).toHaveCount(1);
          }
        });
      }
    }
  });
});
