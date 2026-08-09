import { expect, test } from './fixtures.mjs';
import { gotoPath, modes, publicOnly, routes, seedTheme, setViewportAndMedia } from './support.mjs';

test.describe('Public Drupal route contract', () => {
  test.skip(publicOnly, 'DWARS_AUTH_ONLY runs only authenticated editorial checks.');

  for (const mode of modes) {
    for (const route of routes) {
      test(`${mode.name}: ${route.name}`, async ({ page }) => {
        await setViewportAndMedia(page, mode);
        await seedTheme(page, mode.theme);
        const response = await gotoPath(page, route.path);

        expect(response?.status()).toBe(route.status || 200);
        expect(await page.locator(route.selector).count()).toBeGreaterThan(0);
        await expect(page.locator('.dwars-copyright-corner')).toHaveCount(1);
        expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);

        if (mode.theme === 'dark') {
          await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
          await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(34, 34, 34)');
        }
        else {
          await expect(page.locator('html')).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/);
          await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        }

        const favicon = page.locator('link[rel~="icon"]');
        await expect(favicon).toHaveAttribute('href', /\/themes\/custom\/dwars2026\/favicon\.ico$/);
        if (mode.mobile) {
          await expect(page.locator('.dwars-mobile-header')).toBeVisible();
        }
        else {
          await expect(page.locator('.dwars-desktop-sidebar')).toBeVisible();
        }

        if (route.name === 'culture-agenda') {
          await expect(page.locator('main input[type="submit"][value="Toepassen"]')).toHaveCount(1);
        }
        if (mode.mobile && mode.theme === 'light' && ['articles', 'search', 'category'].includes(route.name)) {
          await expect(page.locator('.dwars-archive-results h2').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
          await expect(page.locator('aside h3').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
        }
        if (mode.mobile && mode.theme === 'light' && route.name === 'home') {
          await expect(page.locator('.dwars-home-preview h2').first()).toHaveCSS('color', 'rgb(0, 0, 0)');
        }
      });
    }
  }
});
