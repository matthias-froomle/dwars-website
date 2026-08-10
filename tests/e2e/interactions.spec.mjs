import { expect, test } from './fixtures.mjs';
import { gotoPath, publicOnly, seedTheme } from './support.mjs';

test.describe('DWARS visual interactions', () => {
  test.skip(publicOnly, 'DWARS_AUTH_ONLY runs only authenticated editorial checks.');

  test('article tags and related thumbnails keep their designed behavior', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedTheme(page, 'dark');
    await gotoPath(page, '/nl/artikel/sportief-sprookje');

    const tag = page.locator('article a.bg-tape').first();
    expect(await tag.evaluate((element) => getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage)).toContain('tape-light.png');
    await tag.hover();
    await expect(tag).toHaveCSS('background-color', 'rgb(255, 0, 85)');
    await expect(tag).toHaveCSS('color', 'rgb(255, 255, 255)');

    const frames = await page.locator('.dwars-related-thumbnail').evaluateAll((elements) => elements.map((frame) => {
      const frameRect = frame.getBoundingClientRect();
      const image = frame.querySelector('img:not([hidden])');
      const imageRect = image?.getBoundingClientRect();
      return {
        width: frameRect.width,
        height: frameRect.height,
        imageWidth: imageRect?.width ?? null,
        imageHeight: imageRect?.height ?? null,
        objectFit: image ? getComputedStyle(image).objectFit : null,
      };
    }));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.width).toBeCloseTo(64, 0);
      expect(frame.height).toBeCloseTo(64, 0);
      if (frame.imageWidth !== null) {
        expect(frame.imageWidth).toBeCloseTo(64, 0);
        expect(frame.imageHeight).toBeCloseTo(64, 0);
        expect(frame.objectFit).toBe('cover');
      }
    }

    const relatedTitle = page.locator('.dwars-related-articles article a > span:last-child').first();
    await relatedTitle.evaluate((element) => {
      element.textContent = 'VICERECTOR CHRIS VAN GINNEKEN OVER INCLUSIEVERE ONDERWIJS- EN EXAMENMAATREGELEN';
    });
    const relatedBounds = await relatedTitle.evaluate((element) => {
      const titleRect = element.getBoundingClientRect();
      const rowRect = element.parentElement.getBoundingClientRect();
      return {
        titleOverflow: element.scrollWidth - element.clientWidth,
        titleRight: titleRect.right,
        rowRight: rowRect.right,
      };
    });
    expect(relatedBounds.titleOverflow).toBeLessThanOrEqual(1);
    expect(relatedBounds.titleRight).toBeLessThanOrEqual(relatedBounds.rowRight + 1);
    expect(await page.locator('.dwars-article-aside').evaluate((aside) => aside.scrollWidth - aside.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('category paper changes to the DWARS pink treatment on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedTheme(page, 'dark');
    await gotoPath(page, '/nl');

    const image = page.locator('.dwars-category-label img[alt="opinie"]:visible').first();
    await image.locator('..').hover();
    await expect.poll(() => image.evaluate((element) => getComputedStyle(element).filter)).toContain('dwars-category-pink');
  });

  test('long Drupal article titles wrap within a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await seedTheme(page, 'dark');
    await gotoPath(page, '/nl/node/80992');

    const title = page.locator('article h1').first();
    await title.evaluate((element) => {
      element.textContent = 'VICERECTOR CHRIS VAN GINNEKEN OVER INCLUSIEVERE ONDERWIJS- EN EXAMENMAATREGELEN';
    });

    expect(await title.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
  });
});
