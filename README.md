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
DWARS_AUTH_ONLY=1 \
DWARS_LOGIN_URL="$(ddev drush uli --uid=1 \
  --uri=http://dwars-drupal.ddev.site \
  --no-browser)" \
npm run theme:verify-local
```

Do not open that URL manually first. Replace `--uid=1` with
`--name=EDITOR_USERNAME` to test a real editor's permissions. Full local restore,
testing, and production-release instructions are in
[`docs/drupal-theme.md`](docs/drupal-theme.md),
[`tests/e2e/README.md`](tests/e2e/README.md), and
[`docs/production-release-checklist.md`](docs/production-release-checklist.md).

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
