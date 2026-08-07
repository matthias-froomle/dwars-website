import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const themeRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  'dwars2026.info.yml',
  'dwars2026.libraries.yml',
  'dwars2026.theme',
  'dist/css/main.css',
  'src/js/dwars.js',
  'assets/fonts/Veneer Three.ttf',
  'assets/images/dwarslogo_website.png',
  'assets/images/krom_logo.png',
  'templates/layout/html.html.twig',
  'templates/layout/page.html.twig',
  'templates/layout/page--front.html.twig',
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Theme contract check passed (${files.length} files).`);
