# Drupal theme acceptance tests

This directory is the automated browser contract for the native `dwars2026`
Drupal theme. Playwright launches its own isolated Chromium; Chromium-MCP
remains useful for interactive inspection but is not a test dependency.

Install the pinned Node dependencies and Playwright's matching isolated browser,
then run the public suite against the local DDEV restore from the repository
root:

```bash
npm ci
npx playwright install chromium
npm run theme:verify-local
```

`npm ci` installs `@playwright/test`; downloading Chromium is an explicit
second step. The browser installation is normally needed only on a new machine
or after changing the Playwright version. Minimal Linux CI images may use `npx
playwright install --with-deps chromium` to install required system libraries as
well.

Override `DWARS_LOCAL_ORIGIN` to test another deployed origin and
`DWARS_VERIFY_OUTPUT` to choose the JSON report path. Missing public-upload
resources are attached as diagnostic evidence because the local snapshot omits
them; page and console errors fail the run.

The public contract covers 19 route types across desktop and phone, light and
dark modes, plus automatic/manual theme selection and focused interaction
checks. `authenticated.spec.mjs` additionally covers the editor-only front-end
Views when supplied a fresh one-time login URL. For the local DDEV restore, the
complete copy-paste command is:

```bash
DWARS_EDITOR_USERNAME='EDITOR_USERNAME'
DWARS_AUTH_ONLY=1 \
DWARS_LOGIN_URL="$(ddev drush uli --name="$DWARS_EDITOR_USERNAME" \
  --uri=http://dwars-drupal.ddev.site \
  --no-browser)" \
npm run theme:verify-local
```

The command generates the URL without opening it and lets Playwright consume it
immediately. Choose an active editor who can access `credits`, `fotograaf`,
`tags`, `meewerken-lijst`, and `reserve`; restored snapshots may keep UID 1
blocked. Do not open the URL manually first, and generate a new URL for every
run.

Failure screenshots and retained traces are stored below `test-results/`, which
is intentionally ignored by Git.
