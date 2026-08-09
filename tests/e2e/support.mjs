export const publicOnly = process.env.DWARS_AUTH_ONLY === '1';

export const routes = [
  { name: 'home', path: '/nl', selector: 'main' },
  { name: 'editions', path: '/nl/archive', selector: '.dwars-edition-cover' },
  { name: 'articles', path: '/nl/alle-artikels', selector: '.dwars-archive-results' },
  { name: 'search', path: '/nl/search/node?keys=studentenraad', selector: '.dwars-archive-results' },
  { name: 'category', path: '/nl/taxonomy/term/18', selector: '.dwars-archive-results' },
  { name: 'krom', path: '/nl/taxonomy/term/4691', selector: 'main' },
  { name: 'redactie', path: '/nl/redactie', selector: '.dwars-redactie-intro' },
  { name: 'freelance', path: '/nl/freelance', selector: '.dwars-redactie-intro' },
  { name: 'former-editors', path: '/nl/oud-redactie', selector: '.dwars-redactie-intro' },
  { name: 'vision', path: '/nl/visie', selector: '.dwars-page-over' },
  { name: 'join', path: '/nl/meewerken', selector: '.dwars-page-redacteur-worden' },
  { name: 'advertise', path: '/nl/adverteren', selector: '.dwars-page-adverteren' },
  { name: 'contact', path: '/nl/contact', selector: '.dwars-page-contact' },
  { name: 'article', path: '/nl/node/80992', selector: 'article' },
  { name: 'editor', path: '/nl/redactielid/pieter-vierstraete', selector: 'article' },
  { name: 'culture-agenda', path: '/nl/cultuuragenda', selector: '.dwars-culture-agenda' },
  { name: 'culture-detail', path: '/nl/content/couleur-cafe', selector: '.dwars-culture-detail' },
  { name: 'frontpage', path: '/nl/frontpage', selector: 'main' },
  { name: 'not-found', path: '/nl/production-readiness-missing-page', selector: '.dwars-404__paper', status: 404 },
];

export const modes = [
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', mobile: false },
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', mobile: false },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark', mobile: true },
  { name: 'mobile-light', width: 390, height: 844, theme: 'light', mobile: true },
];

export const authenticatedRoutes = [
  { name: 'credits', path: '/nl/credits' },
  { name: 'photographers', path: '/nl/fotograaf' },
  { name: 'tags', path: '/nl/tags' },
  { name: 'contributors', path: '/nl/meewerken-lijst' },
  { name: 'reserve', path: '/nl/reserve' },
];

export async function setViewportAndMedia(page, mode) {
  await page.setViewportSize({ width: mode.width, height: mode.height });
  await page.emulateMedia({ colorScheme: mode.theme });
}

export async function seedTheme(page, theme) {
  await page.addInitScript((value) => localStorage.setItem('dwars-theme', value), theme);
}

export async function waitForThemePage(page) {
  await page.evaluate(async () => {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 2_500)),
    ]);
  });
  await page.waitForTimeout(100);
}

export async function gotoPath(page, path) {
  const response = await page.goto(path, { waitUntil: 'load' });
  await waitForThemePage(page);
  return response;
}

export async function visibleThemeToggle(page, mobile) {
  if (mobile) {
    const menuToggle = page.locator('[data-dwars-menu-toggle]');
    if (await menuToggle.getAttribute('aria-expanded') !== 'true') {
      await menuToggle.click();
    }
  }
  return page.locator('[data-dwars-theme-toggle]:visible');
}
