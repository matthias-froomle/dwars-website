import { writeFile } from 'node:fs/promises';

const origin = process.env.DWARS_LOCAL_ORIGIN || 'http://dwars-drupal.ddev.site';
const cdpOrigin = process.env.CHROMIUM_CDP_ORIGIN || 'http://127.0.0.1:9222';
const output = process.env.DWARS_VERIFY_OUTPUT || '/private/tmp/dwars-theme-production-check.json';
const loginUrl = process.env.DWARS_LOGIN_URL;
const authOnly = process.env.DWARS_AUTH_ONLY === '1';
const routes = [
  ['home', '/nl', 'main'],
  ['editions', '/nl/archive', '.dwars-edition-cover'],
  ['articles', '/nl/alle-artikels', '.dwars-archive-results'],
  ['search', '/nl/search/node?keys=studentenraad', '.dwars-archive-results'],
  ['category', '/nl/taxonomy/term/18', '.dwars-archive-results'],
  ['krom', '/nl/taxonomy/term/4691', 'main'],
  ['redactie', '/nl/redactie', '.dwars-redactie-intro'],
  ['freelance', '/nl/freelance', '.dwars-redactie-intro'],
  ['former-editors', '/nl/oud-redactie', '.dwars-redactie-intro'],
  ['vision', '/nl/visie', '.dwars-page-over'],
  ['join', '/nl/meewerken', '.dwars-page-redacteur-worden'],
  ['advertise', '/nl/adverteren', '.dwars-page-adverteren'],
  ['contact', '/nl/contact', '.dwars-page-contact'],
  ['article', '/nl/node/80992', 'article'],
  ['editor', '/nl/redactielid/pieter-vierstraete', 'article'],
  ['culture-agenda', '/nl/cultuuragenda', '.dwars-culture-agenda'],
  ['culture-detail', '/nl/content/couleur-cafe', '.dwars-culture-detail'],
  ['frontpage', '/nl/frontpage', 'main'],
  ['not-found', '/nl/production-readiness-missing-page', '.dwars-404__paper'],
];
const modes = [
  ['desktop-dark', 1440, 1000, 'dark'],
  ['desktop-light', 1440, 1000, 'light'],
  ['mobile-dark', 390, 844, 'dark'],
];
const authenticatedRoutes = [
  ['credits', '/nl/credits'],
  ['photographers', '/nl/fotograaf'],
  ['tags', '/nl/tags'],
  ['contributors', '/nl/meewerken-lijst'],
  ['reserve', '/nl/reserve'],
];

const target = await fetch(`${cdpOrigin}/json/new?about%3Ablank`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
let navigationStatus = null;
let pageErrors = [];
let missingResources = [];
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const promise = pending.get(message.id);
    pending.delete(message.id);
    message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result);
    return;
  }
  if (message.method === 'Network.responseReceived' && message.params.type === 'Document') {
    navigationStatus = message.params.response.status;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  }
  if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
    const entry = message.params.entry;
    if (entry.source === 'network' && entry.text?.startsWith('Failed to load resource:')) {
      missingResources.push(entry.url || entry.text);
    }
    else {
      pageErrors.push(entry.text || 'Browser log error');
    }
  }
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await command('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
})).result.value;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await Promise.all([
  command('Page.enable'),
  command('Runtime.enable'),
  command('Log.enable'),
  command('Network.enable'),
]);

async function navigate(path, expectedSelector) {
  navigationStatus = null;
  pageErrors = [];
  missingResources = [];
  const url = new URL(path, origin).toString();
  await command('Page.navigate', { url });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(new URL(url).pathname)}`);
    if (ready) break;
    await sleep(100);
  }
  await evaluate(`Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))])`);
  await sleep(100);
  const state = await evaluate(`(() => {
    const selector = ${JSON.stringify(expectedSelector)};
    const sidebar = document.querySelector('.dwars-desktop-sidebar');
    const mobileHeader = document.querySelector('.dwars-mobile-header');
    return {
      url: location.href,
      title: document.title,
      marker: Boolean(document.querySelector(selector)),
      dark: document.documentElement.classList.contains('dark'),
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      footerCount: document.querySelectorAll('.dwars-copyright-corner').length,
      sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
      mobileHeaderDisplay: mobileHeader ? getComputedStyle(mobileHeader).display : null,
      submitLabels: [...document.querySelectorAll('main input[type="submit"]')].map((input) => input.value),
    };
  })()`);
  return {
    status: navigationStatus,
    errors: [...pageErrors],
    missingResources: [...missingResources],
    ...state,
  };
}

async function reloadPage(path) {
  await command('Page.reload', { ignoreCache: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path)}`);
    if (ready) break;
    await sleep(100);
  }
  await evaluate(`Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))])`);
  await sleep(100);
}

const results = {};
const interactions = {};
const failures = [];
for (const [mode, width, height, theme] of (authOnly ? [] : modes)) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await command('Page.navigate', { url: new URL('/nl', origin).toString() });
  await sleep(150);
  await evaluate(`localStorage.setItem('dwars-theme', ${JSON.stringify(theme)})`);
  results[mode] = {};
  for (const [name, path, selector] of routes) {
    const result = await navigate(path, selector);
    results[mode][name] = result;
    const expectedStatus = name === 'not-found' ? 404 : 200;
    const expectations = [
      [result.status === expectedStatus, `HTTP ${expectedStatus}`],
      [result.marker, `marker ${selector}`],
      [result.footerCount === 1, 'one shared footer'],
      [result.horizontalOverflow <= 1, 'no horizontal overflow'],
      [result.dark === (theme === 'dark'), `${theme} theme`],
      [result.errors.length === 0, 'no browser errors'],
      [width < 600 ? result.mobileHeaderDisplay !== 'none' : result.sidebarDisplay !== 'none', 'responsive navigation shell'],
    ];
    for (const [passed, expectation] of expectations) {
      if (!passed) failures.push(`${mode}/${name}: ${expectation}`);
    }
    if (name === 'culture-agenda' && !result.submitLabels.includes('Toepassen')) {
      failures.push(`${mode}/${name}: Dutch filter label`);
    }
  }
}

if (!authOnly) {
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await navigate('/nl', 'main');
  await evaluate(`localStorage.removeItem('dwars-theme')`);
  await reloadPage('/nl');
  const themeState = () => evaluate(`(() => {
    const button = document.querySelector('[data-dwars-theme-toggle]');
    return {
      dark: document.documentElement.classList.contains('dark'),
      stored: localStorage.getItem('dwars-theme'),
      pressed: button?.getAttribute('aria-pressed'),
      label: button?.querySelector('[data-theme-label]')?.textContent.trim(),
    };
  })()`);
  interactions.autoDark = await themeState();

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await reloadPage('/nl');
  interactions.autoLight = await themeState();

  await evaluate(`document.querySelector('[data-dwars-theme-toggle]').click()`);
  interactions.manualDark = await themeState();
  await reloadPage('/nl');
  interactions.persistedDark = await themeState();

  await evaluate(`document.querySelector('[data-dwars-theme-toggle]').click()`);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await reloadPage('/nl');
  interactions.persistedLight = await themeState();

  const themeExpectations = [
    [interactions.autoDark.dark && interactions.autoDark.stored === null && interactions.autoDark.pressed === 'true', 'automatic system dark mode'],
    [!interactions.autoLight.dark && interactions.autoLight.stored === null && interactions.autoLight.pressed === 'false', 'automatic system light mode'],
    [interactions.manualDark.dark && interactions.manualDark.stored === 'dark' && interactions.manualDark.pressed === 'true', 'manual dark selection'],
    [interactions.persistedDark.dark && interactions.persistedDark.stored === 'dark', 'persisted dark selection'],
    [!interactions.persistedLight.dark && interactions.persistedLight.stored === 'light' && interactions.persistedLight.pressed === 'false', 'persisted light override'],
  ];
  for (const [passed, expectation] of themeExpectations) {
    if (!passed) failures.push(`interaction/theme: ${expectation}`);
  }

  await evaluate(`localStorage.setItem('dwars-theme', 'dark')`);
  await navigate('/nl/artikel/sportief-sprookje', 'article');
  const tagBefore = await evaluate(`(() => {
    const tag = document.querySelector('article a.bg-tape');
    if (!tag) return null;
    const rect = tag.getBoundingClientRect();
    const css = getComputedStyle(tag);
    const aside = document.querySelector('.dwars-article-aside');
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      maskImage: css.maskImage || css.webkitMaskImage,
      relatedFrames: [...document.querySelectorAll('.dwars-related-thumbnail')].map((frame) => {
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
      }),
      asideOverflow: aside ? aside.scrollWidth - aside.clientWidth : null,
    };
  })()`);
  if (tagBefore) {
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: tagBefore.rect.x + tagBefore.rect.width / 2,
      y: tagBefore.rect.y + tagBefore.rect.height / 2,
    });
    await sleep(250);
  }
  const tagAfter = await evaluate(`(() => {
    const tag = document.querySelector('article a.bg-tape');
    if (!tag) return null;
    const css = getComputedStyle(tag);
    return { hover: tag.matches(':hover'), background: css.backgroundColor, color: css.color };
  })()`);
  interactions.article = { tagBefore, tagAfter };
  if (!tagBefore || !tagAfter?.hover || tagAfter.background !== 'rgb(255, 0, 85)' || tagAfter.color !== 'rgb(255, 255, 255)') {
    failures.push('interaction/article: pink tag hover');
  }
  if (!tagBefore?.maskImage?.includes('tape-light.png')) {
    failures.push('interaction/article: torn tag mask');
  }
  if (!tagBefore?.relatedFrames.length || tagBefore.relatedFrames.some((frame) =>
    Math.abs(frame.width - 64) > 1 || Math.abs(frame.height - 64) > 1 ||
    (frame.objectFit !== null && (frame.objectFit !== 'cover' || Math.abs(frame.imageWidth - 64) > 1 || Math.abs(frame.imageHeight - 64) > 1)))) {
    failures.push('interaction/article: square cover thumbnails');
  }
  if ((tagBefore?.asideOverflow ?? 0) > 1) {
    failures.push('interaction/article: related-content overflow');
  }

  await navigate('/nl', 'main');
  const categoryRect = await evaluate(`(() => {
    const image = [...document.querySelectorAll('.dwars-category-label img')]
      .find((item) => item.alt.toLowerCase() === 'opinie' && item.getBoundingClientRect().width > 0);
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  if (categoryRect) {
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: categoryRect.x + categoryRect.width / 2,
      y: categoryRect.y + categoryRect.height / 2,
    });
    await sleep(250);
  }
  interactions.category = await evaluate(`(() => {
    const image = [...document.querySelectorAll('.dwars-category-label img')]
      .find((item) => item.alt.toLowerCase() === 'opinie' && item.getBoundingClientRect().width > 0);
    return image ? { hover: image.parentElement.matches(':hover'), filter: getComputedStyle(image).filter } : null;
  })()`);
  if (!interactions.category?.hover || !interactions.category.filter.includes('dwars-category-pink')) {
    failures.push('interaction/category: full pink torn-label hover');
  }
  await evaluate(`localStorage.removeItem('dwars-theme')`);
}

if (loginUrl) {
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: loginUrl });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete' && location.origin === ${JSON.stringify(new URL(origin).origin)}`);
    if (ready) break;
    await sleep(100);
  }
  await evaluate(`localStorage.setItem('dwars-theme', 'dark')`);

  for (const [mode, width, height] of [['authenticated-desktop', 1440, 1000], ['authenticated-mobile', 390, 844]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    results[mode] = {};
    for (const [name, path] of authenticatedRoutes) {
      const result = await navigate(path, '.dwars-editorial-tool');
      const toolbar = await evaluate(`Boolean(document.querySelector('#toolbar-administration'))`);
      results[mode][name] = { ...result, toolbar };
      const expectations = [
        [result.status === 200, 'HTTP 200'],
        [result.marker, 'editorial tool template'],
        [result.footerCount === 1, 'one shared footer'],
        [result.horizontalOverflow <= 1, 'no page-level horizontal overflow'],
        [result.errors.length === 0, 'no browser errors'],
        [toolbar, 'authenticated Drupal toolbar'],
        [width < 600 ? result.mobileHeaderDisplay !== 'none' : result.sidebarDisplay !== 'none', 'responsive navigation shell'],
      ];
      for (const [passed, expectation] of expectations) {
        if (!passed) failures.push(`${mode}/${name}: ${expectation}`);
      }
      if (name === 'photographers' && !result.submitLabels.includes('Toepassen')) {
        failures.push(`${mode}/${name}: Dutch filter label`);
      }
    }
  }
}

await writeFile(output, JSON.stringify({ origin, authenticated: Boolean(loginUrl), results, interactions, failures }, null, 2));
socket.close();
await fetch(`${cdpOrigin}/json/close/${target.id}`);
if (failures.length) {
  console.error(failures.join('\n'));
  console.error(output);
  process.exit(1);
}
const checkCount = (authOnly ? 0 : (modes.length * routes.length) + 9) + (loginUrl ? 2 * authenticatedRoutes.length : 0);
console.log(`Theme browser verification passed (${checkCount} route/mode checks).`);
console.log(output);
