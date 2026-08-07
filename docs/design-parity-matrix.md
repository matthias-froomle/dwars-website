# Drupal / Vercel design parity matrix

The implementation in this repository and the deployed Vercel preview are the
visual contract. Drupal remains responsible for routes, content, Views, files,
forms, and editorial workflows.

## Acceptance contract

Each route is complete only after it is checked at desktop dark, desktop light,
and mobile widths. Page-specific hover/focus interactions, the persisted manual
theme override, system-theme fallback, Veneer headings, image grayscale/color
transitions, and the browser console must also pass.

| Design route | Drupal route | Current state | Verification evidence |
| --- | --- | --- | --- |
| `/` | `/nl` (front page) | Verified | The three-row `latest` View supplies hero plus two compact previews; the recent View supplies a non-duplicating 13-card masonry with the reference image/text rhythm. Archive link, mobile shell, grayscale/color hover, and dark/light modes are covered. |
| `/edities` | `/nl/archive` | Verified | Six-column desktop/two-column mobile grid; cards, labels, covers, files, order, and available issue range come only from the Drupal archive View. |
| `/archief` | `/nl/alle-artikels` | Verified | Row-card geometry and reference sidebar; article rows, tags, editions, authors, links, search value, and pager are derived from Drupal. |
| `/archief?tags=...` | `/nl/taxonomy/term/[term]` | Verified | Non-Krom taxonomy Views use ten archive result rows per page and the reference sidebar with the active Drupal term checked; record selection and order remain View-owned. |
| `/archief?search=...` | `/nl/search/node?keys=...` | Verified | Drupal core indexed search relevance and pager render through archive rows; the actual query and result-derived facets replace prototype mock values. |
| `/redactie` | `/nl/redactie` | Theme verified; CMS copy pending | Reference gutters, tape heading, action flow, grouped polaroid grid, font, and hover treatment are matched. Heading/actions and every person/role/photo come from Drupal; the restored View header does not contain the prototype introduction. |
| `/redactie/[slug]` | `/nl/redactielid/[name]` | Verified | Minimal oversized rotated Veneer name page checked on desktop and mobile. |
| `/over` | `/nl/visie` | Verified | Reference shell and system-font typography; first content block has the same dimensions and line wrapping as Vercel. |
| `/redacteur-worden` | `/nl/meewerken` | Verified | Reference shell and typography using the processed Drupal recruitment content. |
| `/adverteren` | `/nl/adverteren` | Theme verified; CMS structure differs | The Drupal node title and complete processed body are styled by the reference shell; tariff copy, tables, addresses, and deadlines are not duplicated in Twig. The restored node contains substantially larger tariff tables than the prototype mock. |
| `/contact` | `/nl/contact` | Theme verified; CMS copy pending | The Drupal body is parsed into the reference information card and two-person grid without duplicating editorial values in Twig. The restored node lacks the prototype's `Algemene gegevens` heading and portrait references. |
| `/krom` | Krom term in the `tags` vocabulary | Theme verified; CMS population pending | Homepage-derived composition and Krom branding; hero, sidebar, and grid use only the taxonomy View result. The semantic term contract avoids a database-ID dependency. The restored taxonomy currently contains only one article, so Drupal correctly renders the sparse state. |
| `/artikels/[slug]` | Drupal article canonical URL | Verified | Hero/tags/title/body/credits composition plus Drupal related-article and advertisement Views. No ad creative is embedded in the theme. |

## Shared shell

| Contract | State |
| --- | --- |
| 320 px torn-paper desktop sidebar | Verified on all 11 designed Drupal routes at 1440 x 1000 |
| Veneer heading font and Vercel system body stack | Verified from computed styles and desktop screenshot pairs |
| System light/dark preference | Verified on all 11 routes; light resolves to white and dark to `#222` on desktop |
| Persisted manual light/dark toggle | Verified across navigation with `dwars-theme` local storage override |
| Mobile header and expanding navigation | Verified at 390 x 844: 142 px header, seven-link menu, settled transform/opacity, body scroll lock |
| Images grayscale by default and color on hover | Verified on hero/cards, edition covers, archive rows, Redactie portraits and article hero/related images |
| No legacy Drupal blocks leaking into designed pages | Verified in the desktop/mobile route sweep |
| No horizontal overflow | Verified on all 11 routes at 1440 px and 390 px widths |
| Missing-media behavior | Verified: absent local managed files render neutral placeholders and do not emit broken-image glyphs or requests |

## Final comparison pass (2026-08-07)

The final automated sweep captured 66 pages: local Drupal and the deployed
Vercel reference for 11 routes at desktop dark, desktop light, and mobile dark.
It was followed by focused post-fix browser checks after the local media-base
and related-card changes.

- shared desktop and mobile shell geometry, body colors, system font, Veneer
  loading, and footer anchoring match;
- the homepage hero starts at `(368, 48)` on desktop and `(16, 158)` on mobile,
  matching the reference padding rhythm;
- Redactie uses 24 px Veneer on desktop and 20 px on mobile, with two horizontal
  desktop actions and the reference two-column member treatment on mobile;
- Contact uses the 804 px desktop card and 342 px mobile card, with two
  CMS-derived people cards;
- the Krom desktop hero and article mobile title use the reference 48 px and
  60 px heading sizes respectively;
- homepage, edition, and Redactie imagery each measured `grayscale(1)` before
  hover and `grayscale(0)` after hover;
- system dark mode, manual override, persistence after reload, and mobile menu
  open/close state all pass;
- the final interaction pass reported zero broken images and zero visible
  broken images.

### Drupal content/configuration still needed for editorial equality

These are intentionally not supplied by the theme:

- rename/reorder the Drupal menu items if the Vercel labels and order are still
  desired (`Edities`, `Over`, `Redacteur worden`, and `Contact` differ);
- change the editions View title from `Archief` to `Edities` and add its intro;
- add the Redactie introduction to the View header and adjust the freelance
  action wording if required;
- add `Algemene gegevens` and portrait references to the Contact content model
  if those exact elements are wanted;
- review whether the full Drupal advertising tables should replace the simpler
  prototype mock composition;
- populate Krom beyond its current single article;
- restore any publication and editorial source files that are absent from the
  local dump if real images are needed instead of neutral placeholders.

## Content boundary

The Vercel pages contain mock article and roster data and are a visual contract
only. Runtime theme code may contain layout, CSS classes, typography, effects,
icons, and reusable interface labels. All editorial values come from Drupal:

- page and article copy from node fields;
- people, roles, portraits, authors, tags, and editions from entities and fields;
- navigation labels, order, and destinations from `menu-dwars-topmenu`;
- archive, article, Krom, advertisement, related-content, and redactie collections
  from Drupal Views;
- redactie heading and action links from the Drupal View header.

The theme does not supplement missing editions, articles, people, filters, or
advertisements with prototype data. If Drupal has no matching record, the design
renders a sparse or empty state. The optional edition importer lives outside the
theme under `scripts/` and is a separately reviewed content migration.
