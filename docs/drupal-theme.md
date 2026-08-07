# DWARS 2026 Drupal theme

`drupal-theme/dwars2026` is the production implementation of the UI prototype in
this repository. It is a standalone Drupal 11 theme (`base theme: false`) and
does not run Next.js, React, JSON:API, or Node.js in production. The existing
prototype remains the visual reference.

The operational production checklist is
[`production-release-checklist.md`](production-release-checklist.md).

## What is mapped to Drupal

- The homepage uses all three rows of `latest:block_1`: the first record is the
  hero and the next two are the compact previews beside it.
- The recent homepage masonry uses the first 13 non-duplicating records selected
  by `homepage_meerartikels`. Positional teaser variants reproduce the
  prototype's image/text rhythm, while every title, excerpt, image, URL, section,
  filter, and sort order remains Drupal-owned.
- Article pages use the existing `artikel` fields, including introduction,
  body, authors, tags, section, photo, links, and comments.
- Editions, editorial staff, advertisements, search, taxonomy, and static pages
  remain Drupal content and Views. Missing records are never filled with mock
  data by Twig or JavaScript.
- Authenticated front-end Views for credits, photographers, tags, contributors,
  and reserve content use the DWARS presentation. Administration and content
  edit forms remain on Drupal's supported Claro administration theme.
- Navigation labels, order, and destinations are loaded from
  `menu-dwars-topmenu`; the theme maps those entries to visual icons.
- Krom is resolved from the `tags` vocabulary by its semantic name, renders
  that View's actual result, and keeps the logo animation. Designed static pages
  and category artwork are likewise matched by CMS aliases/labels rather than
  environment-specific numeric entity IDs.
- Light/dark preference, mobile navigation, search, and accessibility behavior
  are implemented with a small Drupal behavior in plain JavaScript.

## Build and validate

From the repository root:

```bash
npm run theme:install
npm run theme:build
npm run theme:check
npm run theme:package
```

The deployable result is `artifacts/dwars2026-theme.tar.gz`, accompanied by
`artifacts/dwars2026-theme.tar.gz.sha256`. The archive contains
the compiled CSS, templates, configuration, JavaScript, fonts, and UI images. It
does not contain `node_modules`, edition content/cover fallbacks, migration data,
or the large edition PDFs. `theme:check` also rejects known prototype content in
runtime theme sources.

## Restore the production snapshot locally

DDEV needs a local Docker-compatible runtime. On macOS, a suitable setup is:

```bash
brew install colima
colima start --cpu 4 --memory 8 --disk 80
```

Then restore the known snapshot:

```bash
./scripts/restore-drupal-local.sh ../dwars_backup_2026_06_02.tar.gz
./scripts/activate-theme-local.sh
```

Use `--replace` as the second restore argument only when intentionally replacing
an existing ignored `.local-drupal` tree. The restore streams the nested site and
database archives. It excludes production settings, TLS/configuration backups,
the two embedded historical database dumps, temp files, and public uploads. Missing public
media resolves against `https://www.dwars.be/sites/default/files`; no production
credentials are written locally.

After a theme source change:

```bash
npm run theme:build
./scripts/sync-theme-local.sh
ddev drush cache:rebuild
```

With the persistent local Chromium debug session running on port 9222, execute
the repeatable production acceptance sweep:

```bash
npm run theme:verify-local
```

It checks 19 representative Drupal routes in desktop dark, desktop light, and
mobile dark modes, including HTTP status, expected page components, the shared
footer, responsive navigation shell, horizontal overflow, browser errors, the
Dutch culture-filter label, and the real 404 response. Missing-resource requests
are recorded separately because the local restore intentionally excludes the
production public-upload tree; JavaScript/runtime errors still fail the check.

Check at minimum the Dutch homepage, an article, archive, editorial staff,
static pages, search, taxonomy/Krom, mobile navigation, dark mode, pager, and an
authenticated contextual-link page. Also inspect the Drupal log:

```bash
ddev drush watchdog:show --count=50
```

## Optional editions 166-169 content migration

The importer defaults to a non-mutating preview:

```bash
./scripts/import-editions-local.sh --dry-run
./scripts/import-editions-local.sh --apply
```

The importer is repository tooling under `scripts/`, not part of the theme. It
creates published `dwars_nummer` nodes only when a matching `DWARS N` title
does not exist, copies PDF/cover files into Drupal public storage, and supports
the site's historical cover-as-`foto`-node relationship. Dates use the first day
of the printed month where an exact day is unavailable:

| Edition | Publication date | Volume |
| --- | --- | --- |
| 166 | 2025-10-01 | 25 |
| 167 | 2025-11-01 | 25 |
| 168 | 2025-12-01 | 25 |
| 169 | 2026-03-01 | 25 |

Build the separate content archive with `npm run editions:package`. On another
environment, extract it and set `DWARS_EDITION_SOURCE` to its `public` directory
when invoking the Drush script.

## Production deployment runbook

Do not perform these steps until local/editorial acceptance is complete and a
fresh production backup exists.

1. Build and check `artifacts/dwars2026-theme.tar.gz` from the exact reviewed
   commit. Transfer the adjacent `.sha256` file and verify it on the server with
   `sha256sum -c dwars2026-theme.tar.gz.sha256` before extracting.
2. Upload the archive to the server via `ssh dwars@dwars.be`/SCP, extract it as
   `themes/custom/dwars2026`, and confirm ownership/permissions match
   `themes/custom/dwars2025`.
3. From the Drupal root, run `drush theme:enable dwars2026 -y`, then clear cache.
   Enabling installs the five theme-specific block placements under
   `config/install`.
4. Before switching the default, verify the theme exists with `drush theme:list`
   and inspect its block placements with `drush config:get`.
5. Switch with `drush config:set system.theme default dwars2026 -y` and
   `drush cache:rebuild`.
6. Smoke-test the same route matrix as local, plus forms/search and logged-in
   editorial behavior. Inspect recent logs and HTTP errors.
7. Import editions only as a separately reviewed content change; dry-run first.

Rollback is intentionally small and does not delete the new theme or content:

```bash
drush config:set system.theme default dwars2025 -y
drush cache:rebuild
```

Keep the deployment archive, pre-deploy database/files backup, command output,
and smoke-test results together as the release evidence.

## Editorial maintenance boundary

Routine changes to articles, editions, culture events, people, roles, images,
menu labels/order, static-page copy, and existing View filters/sorting require no
theme rebuild. The current redactie/freelance/old-redactie collections and their
headings/actions remain Drupal-owned.

The theme now avoids numeric node and taxonomy IDs. Static designed pages are
recognized by their stable aliases or titles (`visie`, `meewerken`,
`adverteren`, and `contact`), Krom by the `tags` vocabulary and `krom` name, and
the ten category controls by taxonomy labels/aliases. If an entity is recreated,
reusing its established alias/name preserves its presentation.

A developer is still needed when changing content-type or field machine names,
renaming/replacing a View or menu machine name, adding a new specially designed
page, or adding a navigation destination that needs new artwork. Those are site
architecture changes rather than editorial content changes.
