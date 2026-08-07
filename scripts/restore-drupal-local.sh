#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup="${1:-$project_root/../dwars_backup_2026_06_02.tar.gz}"
replace="${2:-}"
docroot="$project_root/.local-drupal"
site_archive="dwars_site_backup_2026_06_02.tar.gz"
database_dump="dwars_db_backup_2026_06_02.sql"

if [[ ! -f "$backup" ]]; then
  echo "Backup not found: $backup" >&2
  exit 1
fi

if [[ -e "$docroot/index.php" && "$replace" != "--replace" ]]; then
  echo "A local Drupal tree already exists. Re-run with --replace to rebuild it." >&2
  exit 1
fi

mkdir -p "$docroot"
if [[ "$replace" == "--replace" ]]; then
  chmod -R u+w "$docroot" 2>/dev/null || true
  find "$docroot" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

echo "Extracting Drupal code without production settings or public uploads..."
tar -xOzf "$backup" "$site_archive" | tar -xzf - -C "$docroot" --strip-components=4 \
  --exclude='var/www/html/dwars/.git' \
  --exclude='var/www/html/dwars/sites/default/files' \
  --exclude='var/www/html/dwars/sites/default/files/*' \
  --exclude='var/www/html/dwars/sites/default/settings.php' \
  --exclude='var/www/html/dwars/sites/default/services.yml' \
  --exclude='var/www/html/dwars/safety-backup.sql' \
  --exclude='var/www/html/dwars/backup20260321.sql' \
  --exclude='var/www/html/dwars/temp' \
  --exclude='var/www/html/dwars/temp/*' \
  --exclude='var/www/html/dwars/tmp' \
  --exclude='var/www/html/dwars/tmp/*'

chmod u+w "$docroot/sites/default"
mkdir -p "$docroot/sites/default/files" "$docroot/themes/custom"
cp "$docroot/sites/default/default.settings.php" "$docroot/sites/default/settings.php"
chmod u+w "$docroot/sites/default/settings.php"
printf '%s\n' \
  '' \
  '// DDEV owns local database credentials; production secrets are never restored.' \
  "if (getenv('IS_DDEV_PROJECT') === 'true' && is_readable(__DIR__ . '/settings.ddev.php')) {" \
  "  require __DIR__ . '/settings.ddev.php';" \
  '}' \
  "\$config['system.performance']['css']['preprocess'] = FALSE;" \
  "\$config['system.performance']['js']['preprocess'] = FALSE;" \
  >> "$docroot/sites/default/settings.php"

echo "Starting the local Drupal runtime..."
cd "$project_root"
ddev start

echo "Importing the database through a stream (no second 6 GB copy)..."
tar -xOzf "$backup" "$database_dump" | ddev import-db

"$project_root/scripts/sync-theme-local.sh"
ddev drush cache:rebuild

echo "Local Drupal restored at: $(ddev describe -j | php -r '$d=json_decode(stream_get_contents(STDIN), true); echo $d["raw"]["primary_url"] ?? "run ddev describe";')"
echo "Only media present in the local dump is served; missing files use theme placeholders."
