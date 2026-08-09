import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const themeRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  'dwars2026.info.yml',
  'dwars2026.libraries.yml',
  'dwars2026.theme',
  'favicon.ico',
  'assets/images/favicon-master.png',
  'dist/css/main.css',
  'src/js/dwars.js',
  'assets/fonts/Veneer Three.ttf',
  'assets/images/dwarslogo_website.png',
  'assets/images/krom_logo.png',
  'templates/layout/html.html.twig',
  'templates/layout/page.html.twig',
  'templates/layout/page--front.html.twig',
  'templates/layout/page--404.html.twig',
  'templates/layout/page--editorial-tools.html.twig',
  'templates/content/node--cultuur-strookje.html.twig',
  'templates/views/views-view--editorial-tools.html.twig',
  'templates/views/views-view--credits.html.twig',
  'templates/views/views-view--fotograaf.html.twig',
  'templates/views/views-view--tags.html.twig',
  'templates/views/views-view--meewerken-lijst.html.twig',
  'templates/views/views-view--reserve.html.twig',
  'templates/navigation/pager.html.twig',
  'templates/navigation/views-mini-pager.html.twig',
];
const errors = [];
const prototypeContentPatterns = [
  /Lorem ipsum/i,
  /api\.dicebear\.com/i,
  /studentenraad/i,
  /Thijs van Dam/i,
  /Laura van Dam/i,
  /dwarseditites-/i,
  /data-edition-cover-base/i,
];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const path of required) {
  if (!existsSync(join(themeRoot, path))) errors.push(`Missing required file: ${path}`);
}
if (existsSync(join(themeRoot, 'assets/images/editions'))) {
  errors.push('Prototype edition covers must not be bundled in the runtime theme.');
}

const files = walk(themeRoot);
const themePhp = readFileSync(join(themeRoot, 'dwars2026.theme'), 'utf8');
const legacyEntityIds = ['44', '4691', '78201', '78487', '78874', '4027', '4028', '4026', '4032', '4034', '4053', '4055'];
for (const entityId of legacyEntityIds) {
  if (new RegExp(`\\b${entityId}\\b`).test(themePhp)) {
    errors.push(`Legacy Drupal entity ID ${entityId} must not be coupled to the runtime theme.`);
  }
}

const info = readFileSync(join(themeRoot, 'dwars2026.info.yml'), 'utf8');
if (!/^version:\s+\S+/m.test(info)) errors.push('Theme release version is missing.');
if (!/^logo:\s+assets\/images\/dwarslogo_website\.png$/m.test(info)) {
  errors.push('Theme info must declare the packaged DWARS logo.');
}
for (const dependency of ['block', 'node', 'search', 'system', 'taxonomy', 'views']) {
  if (!new RegExp(`^\\s+- drupal:${dependency}$`, 'm').test(info)) {
    errors.push(`Missing Drupal module dependency: ${dependency}`);
  }
}

for (const file of files.filter((path) => ['.twig', '.css', '.js', '.yml', '.theme'].includes(extname(path)))) {
  const source = readFileSync(file, 'utf8');
  if (/\b(next\/|nextjs|react-dom|__NEXT_DATA__)\b/i.test(source)) {
    errors.push(`Next/React runtime reference in ${relative(themeRoot, file)}`);
  }
  for (const pattern of prototypeContentPatterns) {
    if (pattern.test(source)) {
      errors.push(`Prototype content found in ${relative(themeRoot, file)}: ${pattern}`);
    }
  }
  for (const match of source.matchAll(/dwars_asset_base\s*}}\/(?:{{[^}]+}}|([^"'\s<]+))/g)) {
    if (!match[1] || match[1].includes('?')) continue;
    if (!existsSync(join(themeRoot, 'assets/images', match[1]))) {
      errors.push(`Missing referenced asset ${match[1]} in ${relative(themeRoot, file)}`);
    }
  }
  for (const match of source.matchAll(/@dwars2026\/([^'"\s]+\.html\.twig)/g)) {
    if (!existsSync(join(themeRoot, 'templates', match[1]))) {
      errors.push(`Missing included template ${match[1]} in ${relative(themeRoot, file)}`);
    }
  }
}

for (const phpFile of ['dwars2026.theme']) {
  const php = spawnSync('php', ['-l', join(themeRoot, phpFile)], { encoding: 'utf8' });
  if (php.status !== 0) errors.push(php.stderr.trim() || php.stdout.trim());
}
for (const jsFile of files.filter((path) => extname(path) === '.js')) {
  const node = spawnSync('node', ['--check', jsFile], { encoding: 'utf8' });
  if (node.status !== 0) errors.push(node.stderr.trim() || node.stdout.trim());
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Theme contract check passed (${files.length} files).`);
