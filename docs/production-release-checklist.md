# DWARS 2026 theme production release checklist

This checklist activates only the `dwars2026` presentation layer. It does not
import editorial content, editions, database configuration, or public files.

## Release inputs

- reviewed Git commit containing the theme source;
- `artifacts/dwars2026-theme.tar.gz`;
- `artifacts/dwars2026-theme.tar.gz.sha256`;
- fresh production database and public-files backup;
- confirmed Drupal root on `dwars@dwars.be`.

## Before the switch

1. Verify the release locally:

   ```bash
   npm run theme:build
   npm run theme:check
   npm run theme:verify-local
   npm run theme:package
   ```

   Generate a one-time login URL for a representative editor and repeat the
   authenticated browser sweep with
   `DWARS_AUTH_ONLY=1 DWARS_LOGIN_URL='<url>' npm run theme:verify-local`.
   This adds desktop and mobile checks for `/nl/credits`, `/nl/fotograaf`,
   `/nl/tags`, `/nl/meewerken-lijst`, and `/nl/reserve`.

2. Transfer both artifact files to a new, explicitly named staging directory
   on the server. Do not extract over the active theme until the checksum and
   archive listing have been checked.
3. On the server, verify:

   ```bash
   sha256sum -c dwars2026-theme.tar.gz.sha256
   tar -tzf dwars2026-theme.tar.gz
   drush status
   drush updatedb:status
   ```

4. Confirm the required menu and Views configuration listed in
   `docs/drupal-theme.md` is present. Do not continue if Drupal reports pending
   database updates or a failed bootstrap.

## Activate

From the confirmed Drupal root:

```bash
drush theme:enable dwars2026 -y
drush cache:rebuild
drush config:set system.theme default dwars2026 -y
drush cache:rebuild
```

Enabling first installs the theme-owned block placements while `dwars2025`
remains active. The default-theme change is the only cutover step.

## Smoke test

Check as anonymous and, where relevant, as an editor:

- `/nl`, `/nl/archive`, `/nl/alle-artikels`;
- one article, taxonomy category, search result and empty search;
- `/nl/redactie`, `/nl/freelance`, `/nl/oud-redactie`;
- `/nl/visie`, `/nl/meewerken`, `/nl/adverteren`, `/nl/contact`;
- Krom, `/nl/cultuuragenda`, one culture detail and `/nl/frontpage`;
- authenticated front-end tools: `/nl/credits`, `/nl/fotograaf`, `/nl/tags`,
  `/nl/meewerken-lijst`, and `/nl/reserve`;
- a deliberately missing URL returning HTTP 404;
- desktop dark/light, manual theme toggle, mobile navigation, forms and pager;
- Drupal recent logs and the browser console.

Missing production media is a deployment blocker. Missing media in the local
restore is expected because the backup workflow intentionally omitted the full
public-upload tree.

Drupal administration and node edit forms intentionally remain on Claro. The
DWARS theme owns the authenticated front-end Views, not Drupal's administration
interface.

## Roll back

Rollback does not delete the new theme or content:

```bash
drush config:set system.theme default dwars2025 -y
drush cache:rebuild
```

After rollback, record the failing URL, timestamp, browser output and Drupal log
entry before making another attempt.
