# DWARS website

The production website is Drupal 11 with the native `dwars2026` theme in
[`drupal-theme/dwars2026`](drupal-theme/dwars2026). The Next.js application in
this repository is the visual prototype; production does not need Next.js,
React, JSON:API, Node.js, or Vercel at runtime.

## Drupal theme installation and tests

From the repository root, install the pinned Node dependencies and Playwright's
matching isolated Chromium browser:

```bash
npm ci
npx playwright install chromium
npm run theme:install
```

`npm ci` installs `@playwright/test`; Chromium is an explicit second download.
Install the browser once on a new machine and again after a Playwright version
change. On a minimal Linux CI host, use `npx playwright install --with-deps
chromium` when the required system libraries are missing.

After changing theme source:

```bash
npm run theme:build
./scripts/sync-theme-local.sh
ddev drush cache:rebuild
npm run theme:check
npm run theme:verify-local
npm run theme:package
```

Run only the authenticated editorial acceptance checks with a fresh local
one-time login URL:

```bash
DWARS_EDITOR_USERNAME='EDITOR_USERNAME'
DWARS_AUTH_ONLY=1 \
DWARS_LOGIN_URL="$(ddev drush uli --name="$DWARS_EDITOR_USERNAME" \
  --uri=http://dwars-drupal.ddev.site \
  --no-browser)" \
npm run theme:verify-local
```

Choose an active local account that can access all five editorial Views; do not
assume UID 1 is usable, because restored snapshots may keep that account
blocked. Do not open the generated URL manually first. Full local restore,
testing, and production-release instructions are in
[`docs/drupal-theme.md`](docs/drupal-theme.md),
[`tests/e2e/README.md`](tests/e2e/README.md), and
[`docs/production-release-checklist.md`](docs/production-release-checklist.md).

## Local Froomle Items pilot

The restored local Drupal site can use the production `dwars/article` Froomle
target. Calculating an item selection is local and read-only, but confirming a
synchronization sends Items API requests. Never confirm a selection merely to
test the interface.

Before an agreed Items lifecycle or catalogue test, verify that the source,
Composer staging directory and installed Drupal package are identical and that
no unexpected work is pending:

```bash
./scripts/verify-froomle-items-readiness.sh
```

For a deliberately prepared one-item editorial test, declare the only expected
pending entity and generation:

```bash
./scripts/verify-froomle-items-readiness.sh --expect-pending ENTITY_ID:GENERATION
```

The gate permits completed catalogue-synchronization history and terminal
recovery wake-ups, but blocks unfinished jobs, unresolved job items, pending
delivery work, undeclared editorial work, package drift, Drupal database
updates and mappings that still require explicit reconciliation. It also
requires the referenced-content dependency services and table. It never
processes a queue or calls Froomle.

After the gate reports `READY`, exercise the installed mapping-lifecycle
contract without contacting Froomle:

```bash
ddev drush php:script /var/www/html/scripts/test-froomle-items-mapping-lifecycle.php
```

The acceptance script replaces Drupal's HTTP client in that Drush process,
uses isolated temporary taxonomy content, claims only the exact queue records
it creates, and removes its mapping, content, jobs, state and mock OAuth token
on exit. It verifies identity locking, policy-only saves, explicit previewed
reconciliation, changed-payload upserts and stale-item disables.

For a deliberate catalogue-scale no-op test or required dependency-index
bootstrap against the restored DWARS data,
first run the read-only payload/operation preflight:

```bash
ddev drush php:script /var/www/html/scripts/test-froomle-items-real-catalogue-reconciliation.php
```

Only when it reports `PRECHECK READY` with zero planned operation items, apply
one direction under its fail-closed HTTP handler:

```bash
ddev exec env FROOMLE_NOOP_APPLY=1 drush php:script /var/www/html/scripts/test-froomle-items-real-catalogue-reconciliation.php
```

Run the preflight and applied command a second time to restore the exact
original mapping, then require the readiness gate to report `READY`. The test
uses an impossible fallback before `title.value`, processes the real catalogue
through reconciliation, and fails if any OAuth or Items HTTP request is
attempted. It advances local generations and leaves completed job history, but
must not change accepted payloads or remote state.

## Next.js visual prototype

This is a [Next.js](https://nextjs.org) project bootstrapped with
[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The website is automatically deployed to Vercel: https://dwars-website.vercel.app/
Check out [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
