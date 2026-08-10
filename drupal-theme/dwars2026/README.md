# DWARS 2026 Drupal theme

`dwars2026` is the Drupal 11 implementation of the visual system prototyped in
the Next.js application in this repository. Production runs this native theme;
it does not need Next.js, React, JSON:API, Node.js, or Vercel at runtime.

The current theme release is `1.0.6`.

## Ownership boundary

Drupal owns all editorial data and its behavior: articles, authors, images,
editions, people, culture events, taxonomy, menus, URLs, permissions, View
filters, sorting, moderation, and search. Twig and JavaScript must never provide
mock editorial records or hard-code environment-specific entity IDs.

The theme owns presentation: page composition, templates, fonts, torn-paper
assets, responsive behavior, grayscale-to-colour interactions, hover states,
the DWARS pink palette, and the shared footer/navigation shell. Semantic page
aliases, taxonomy labels, menu names, View names, bundle names, and field
machine names form the integration contract.

Authenticated front-end tools (`credits`, `fotograaf`, `tags`,
`meewerken-lijst`, and `reserve`) use the DWARS theme. Drupal administration and
content edit forms intentionally remain on Claro so core and contributed-module
widgets retain their supported behavior.

## Light and dark mode

With no saved choice, the theme follows the browser/operating-system
`prefers-color-scheme` setting. The sidebar and mobile controls let a visitor
choose light or dark manually. That choice is stored as `dwars-theme` in
`localStorage`, survives reloads, and overrides the system preference until the
stored value is removed.

The small inline script in `templates/layout/html.html.twig` applies the mode
before first paint. `src/js/dwars.js` keeps both controls, their Dutch labels,
icons, and `aria-pressed` state synchronized.

## Structure

- `dwars2026.theme`: Drupal preprocess logic, semantic entity resolution,
  cacheability metadata, View composition, and template suggestions.
- `templates/`: Drupal page, node, View, form, navigation, and component Twig.
- `src/css/main.css`: Tailwind source plus Drupal-specific component rules.
- `dist/css/main.css`: compiled production CSS; commit this file with its source.
- `src/js/dwars.js`: plain Drupal behaviors for modes, menus, image fallbacks,
  and Krom interaction.
- `assets/`: packaged fonts, icons, logos, category labels, and paper textures.
- `favicon.ico`: multi-resolution DWARS browser icon used by Drupal's
  default-favicon setting; it prevents fallback to the Drupal core icon.
- `assets/images/favicon-master.png`: three-colour source master for rebuilding
  the favicon without reusing a legacy or platform logo.
- `config/install/`: block placements installed when the theme is first enabled.
- `scripts/check-theme.mjs`: release contract, PHP, JavaScript, asset, and
  prototype-content checks.
- `scripts/package-theme.mjs`: reproducible deployable archive and checksum.
- `../../tests/e2e/`: Playwright route, theme-mode, interaction, and optional
  authenticated acceptance tests.

## Build and validate

From the repository root:

```bash
npm ci
npx playwright install chromium
npm run theme:install
npm run theme:build
npm run theme:check
npm run theme:verify-local
npm run theme:package
```

`npm ci` installs the pinned `@playwright/test` package from `package-lock.json`.
The separate `npx playwright install chromium` command downloads the matching
isolated browser binary; run it once on a new machine and again after a
Playwright version change. On a minimal Linux CI host, use `npx playwright
install --with-deps chromium` when system browser libraries are not installed.

`theme:package` writes:

- `artifacts/dwars2026-theme.tar.gz`
- `artifacts/dwars2026-theme.tar.gz.sha256`

The archive includes the compiled theme but excludes `node_modules`, public
uploads, database/configuration backups, prototype edition data, and migration
artifacts.

## Local Drupal workflow

The local site runs from the restored snapshot in `.local-drupal` through DDEV.
After editing theme source:

```bash
npm run theme:build
./scripts/sync-theme-local.sh
ddev drush cache:rebuild
npm run theme:verify-local
```

The Playwright sweep launches an isolated headless Chromium and covers 19
representative public routes in desktop and phone layouts in both light and
dark mode. It also checks automatic system-mode selection, manual persistence,
responsive overflow, runtime errors, key hover interactions, readable
phone-layout colours, and the packaged favicon. Failure screenshots and traces
are written below the ignored `test-results/` directory.

An authenticated sweep can be added with a fresh local one-time login URL. The
following command generates and consumes the URL without opening it in your
normal browser:

```bash
DWARS_AUTH_ONLY=1 \
DWARS_LOGIN_URL="$(ddev drush uli --uid=1 \
  --uri=http://dwars-drupal.ddev.site \
  --no-browser)" \
npm run theme:verify-local
```

UID 1 is convenient for testing presentation. To exercise representative
editor permissions instead, replace `--uid=1` with `--name=EDITOR_USERNAME`;
that account must be allowed to open all five authenticated editorial Views.
Generate a new URL for every run and do not visit it manually first, because a
Drupal one-time login URL can only be consumed once.

The complete restore and acceptance workflow is documented in
`docs/drupal-theme.md` in the repository root.

## Production releases

Production is a separate Composer-managed Drupal project at
`dwars@dwars.be:/var/www/html/dwars`; this repository is not its checkout.
Never copy settings, the live database, or public uploads into this repository.

Every deployment must follow the workspace runbook and
`docs/production-release-checklist.md`: read-only health checks, server-only
database/code backups, SHA-256 verification, isolated unpacking, maintenance
mode with an EXIT cleanup trap, atomic replacement with rollback, cache rebuild,
HTTP/browser smoke tests, Automatic Updates readiness as `www-data`, and recent
Drupal-log inspection. `sites/default/files` is preserved and Claro remains the
administration theme.

The guarded repository command implements that workflow over key-based SSH:

```bash
npm run theme:deploy:production -- --preflight
npm run theme:deploy:production -- --confirm-production
```

Preflight builds and packages the theme, requires a clean `main` commit equal to
`origin/main`, and performs read-only production checks. The confirmed command
then creates verified server-only database/code backups, stages and checksums
the artifact, replaces the theme under maintenance mode, and automatically
restores the previous directory if deployment or post-deploy HTTP/browser/log
checks fail. It never stores SSH or Drupal credentials in the repository.

Routine editorial changes require no build or deployment. A developer release
is required for visual changes or changes to bundle, field, menu, View, route,
or template contracts.
