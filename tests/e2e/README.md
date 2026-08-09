# Drupal theme acceptance tests

This directory is the automated browser contract for the native `dwars2026`
Drupal theme. Playwright launches its own isolated Chromium; Chromium-MCP
remains useful for interactive inspection but is not a test dependency.

Run the public suite against the local DDEV restore from the repository root:

```bash
npx playwright install chromium
npm run theme:verify-local
```

Override `DWARS_LOCAL_ORIGIN` to test another deployed origin and
`DWARS_VERIFY_OUTPUT` to choose the JSON report path. Missing public-upload
resources are attached as diagnostic evidence because the local snapshot omits
them; page and console errors fail the run.

The public contract covers 19 route types across desktop and phone, light and
dark modes, plus automatic/manual theme selection and focused interaction
checks. `authenticated.spec.mjs` additionally covers the editor-only front-end
Views when supplied a one-time login URL:

```bash
DWARS_AUTH_ONLY=1 \
DWARS_LOGIN_URL='<one-time-login-url>' \
npm run theme:verify-local
```

Failure screenshots and retained traces are stored below `test-results/`, which
is intentionally ignored by Git.
