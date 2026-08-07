import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const themeRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(dirname(themeRoot));
const artifacts = join(repositoryRoot, 'artifacts');
const archive = join(artifacts, 'dwars2026-theme.tar.gz');
mkdirSync(artifacts, { recursive: true });

const result = spawnSync('tar', [
  '-czf', archive,
  '--exclude=dwars2026/node_modules',
  '--exclude=dwars2026/.gitignore',
  '-C', dirname(themeRoot),
  'dwars2026',
], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(archive);
