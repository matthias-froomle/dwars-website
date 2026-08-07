#!/usr/bin/env bash
set -Eeuo pipefail

dwars_mode="${1:-}"
if [[ "$dwars_mode" != "--preflight" && "$dwars_mode" != "--confirm-production" ]]; then
  echo "Usage: npm run theme:deploy:production -- --preflight" >&2
  echo "   or: npm run theme:deploy:production -- --confirm-production" >&2
  exit 2
fi

dwars_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dwars_repo_root="$(cd "$dwars_script_dir/.." && pwd)"
dwars_theme_root="$dwars_repo_root/drupal-theme/dwars2026"
dwars_artifact_dir="$dwars_repo_root/artifacts"
dwars_ssh_target="${DWARS_SSH_TARGET:-dwars@dwars.be}"
dwars_production_root="${DWARS_PRODUCTION_ROOT:-/var/www/html/dwars}"
dwars_backup_root="${DWARS_BACKUP_ROOT:-/home/dwars/maintenance-backups}"
dwars_expected_branch="${DWARS_DEPLOY_BRANCH:-main}"
dwars_ssh_options=(-o BatchMode=yes -o ConnectTimeout=10)

for dwars_command in git npm node ssh scp shasum; do
  command -v "$dwars_command" >/dev/null || {
    echo "Missing required command: $dwars_command" >&2
    exit 1
  }
done

cd "$dwars_repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing production deployment from a dirty worktree." >&2
  git status --short >&2
  exit 1
fi

dwars_branch="$(git branch --show-current)"
if [[ "$dwars_branch" != "$dwars_expected_branch" ]]; then
  echo "Expected branch $dwars_expected_branch, found $dwars_branch." >&2
  exit 1
fi

git fetch --quiet origin "$dwars_expected_branch"
dwars_commit="$(git rev-parse HEAD)"
dwars_remote_commit="$(git rev-parse "origin/$dwars_expected_branch")"
if [[ "$dwars_commit" != "$dwars_remote_commit" ]]; then
  echo "Refusing deployment: HEAD is not the pushed origin/$dwars_expected_branch commit." >&2
  exit 1
fi

npm run theme:build
npm run theme:check
npm run theme:package

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Build changed tracked files. Commit and push the generated result first." >&2
  git status --short >&2
  exit 1
fi

(cd "$dwars_artifact_dir" && shasum -a 256 -c dwars2026-theme.tar.gz.sha256)

dwars_version="$(awk '/^version:/ { print $2; exit }' "$dwars_theme_root/dwars2026.info.yml")"
if [[ ! "$dwars_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid theme release version: $dwars_version" >&2
  exit 1
fi

echo "Candidate: dwars2026 $dwars_version at $dwars_commit"
echo "Target: $dwars_ssh_target:$dwars_production_root"

dwars_preflight_output="$(ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
  "$dwars_production_root" "$dwars_backup_root" <<'DWARS_REMOTE_PREFLIGHT'
set -Eeuo pipefail
dwars_root="$1"
dwars_backups="$2"
cd "$dwars_root"

test -x vendor/bin/drush
test -f composer.json
test -d themes/custom/dwars2026
test -d sites/default/files
test "$(vendor/bin/drush state:get system.maintenance_mode)" = "0"
test "$(vendor/bin/drush config:get system.theme default --format=string)" = "dwars2026"
dwars_updates="$(vendor/bin/drush updatedb:status --format=json)"
test -z "$dwars_updates" || test "$dwars_updates" = "[]"
test "$(stat -c '%U:%G %a' sites/default/settings.php)" = "dwars:www-data 444"

dwars_available_kb="$(df -Pk "$dwars_backups" | awk 'NR == 2 { print $4 }')"
test "$dwars_available_kb" -ge 5242880

composer validate --check-lock --no-check-publish
composer audit --locked --no-interaction

for dwars_config in \
  system.menu.menu-dwars-topmenu \
  system.menu.menu-dwars-hoofdmenu \
  views.view.latest \
  views.view.advertenties \
  views.view.homepage_meerartikels \
  views.view.related_articles \
  views.view.taxonomy_term \
  views.view.archive \
  views.view.alle_artikels \
  views.view.cultuuragenda \
  views.view.redactie \
  views.view.freelance \
  views.view.oud_redactie \
  views.view.credits \
  views.view.fotograaf \
  views.view.tags \
  views.view.meewerken_lijst \
  views.view.reserve; do
  vendor/bin/drush config:get "$dwars_config" id --format=string >/dev/null
done

test "$(curl -sS -o /dev/null -w '%{http_code}' https://dwars.be/)" = "200"
test "$(curl -sS -o /dev/null -w '%{http_code}' https://dwars.be/nl)" = "200"

dwars_error_cursor="$(vendor/bin/drush php:eval 'echo \Drupal::database()->query("SELECT COALESCE(MAX(wid), 0) FROM {watchdog}")->fetchField();')"
dwars_live_version="$(awk '/^version:/ { print $2; exit }' themes/custom/dwars2026/dwars2026.info.yml)"
echo "DWARS_ERROR_CURSOR=$dwars_error_cursor"
echo "DWARS_LIVE_VERSION=$dwars_live_version"
echo "DWARS_AVAILABLE_KB=$dwars_available_kb"
DWARS_REMOTE_PREFLIGHT
)"
printf '%s\n' "$dwars_preflight_output"

dwars_error_cursor="$(printf '%s\n' "$dwars_preflight_output" | sed -n 's/^DWARS_ERROR_CURSOR=//p' | tail -n 1)"
dwars_live_version="$(printf '%s\n' "$dwars_preflight_output" | sed -n 's/^DWARS_LIVE_VERSION=//p' | tail -n 1)"
if [[ ! "$dwars_error_cursor" =~ ^[0-9]+$ || -z "$dwars_live_version" ]]; then
  echo "Could not parse production preflight evidence." >&2
  exit 1
fi

if [[ "$dwars_mode" == "--preflight" ]]; then
  echo "Production preflight passed; no production state was changed."
  exit 0
fi

if [[ "$dwars_live_version" == "$dwars_version" ]]; then
  echo "Production already runs dwars2026 $dwars_version; refusing a duplicate deployment." >&2
  exit 1
fi

dwars_timestamp="$(ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" 'date +%F-%H%M%S')"
if [[ ! "$dwars_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}$ ]]; then
  echo "Invalid production timestamp: $dwars_timestamp" >&2
  exit 1
fi

dwars_backup_dir="$dwars_backup_root/$dwars_timestamp-before-dwars2026-$dwars_version"
dwars_release_dir="$dwars_backup_root/$dwars_timestamp-dwars2026-$dwars_version-release"

ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
  "$dwars_production_root" "$dwars_backup_dir" "$dwars_release_dir" <<'DWARS_REMOTE_BACKUP'
set -Eeuo pipefail
dwars_root="$1"
dwars_backup="$2"
dwars_release="$3"
cd "$dwars_root"
mkdir -p "$dwars_backup" "$dwars_release"

vendor/bin/drush sql:dump --gzip --result-file="$dwars_backup/database.sql"
tar --acls --xattrs -czf "$dwars_backup/code-and-composer.tar.gz" \
  --exclude='./sites/default/files' \
  --exclude='./tmp' \
  --exclude='./temp' \
  --exclude='*.sql' \
  .
sha256sum \
  "$dwars_backup/database.sql.gz" \
  "$dwars_backup/code-and-composer.tar.gz" \
  > "$dwars_backup/SHA256SUMS"
gzip -t "$dwars_backup/database.sql.gz"
tar -tzf "$dwars_backup/code-and-composer.tar.gz" >/dev/null
sha256sum -c "$dwars_backup/SHA256SUMS"
DWARS_REMOTE_BACKUP

scp "${dwars_ssh_options[@]}" \
  "$dwars_artifact_dir/dwars2026-theme.tar.gz" \
  "$dwars_artifact_dir/dwars2026-theme.tar.gz.sha256" \
  "$dwars_ssh_target:$dwars_release_dir/"

ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
  "$dwars_release_dir" "$dwars_version" <<'DWARS_REMOTE_STAGE'
set -Eeuo pipefail
dwars_release="$1"
dwars_version="$2"
cd "$dwars_release"
sha256sum -c dwars2026-theme.tar.gz.sha256
tar -tzf dwars2026-theme.tar.gz >/dev/null
mkdir -p unpacked
test ! -e unpacked/dwars2026
tar -xzf dwars2026-theme.tar.gz -C unpacked
test ! -d unpacked/dwars2026/node_modules
test "$(awk '/^version:/ { print $2; exit }' unpacked/dwars2026/dwars2026.info.yml)" = "$dwars_version"
test -f unpacked/dwars2026/dist/css/main.css
DWARS_REMOTE_STAGE

ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
  "$dwars_production_root" "$dwars_backup_dir" "$dwars_release_dir" "$dwars_version" <<'DWARS_REMOTE_DEPLOY'
set -Eeuo pipefail
dwars_root="$1"
dwars_backup="$2"
dwars_release="$3"
dwars_version="$4"
dwars_stage="$dwars_release/unpacked/dwars2026"
dwars_old="$dwars_backup/dwars2026-live-directory"
cd "$dwars_root"

dwars_cleanup() {
  dwars_rc=$?
  trap - EXIT
  if [[ "$dwars_rc" -ne 0 && -d "$dwars_old" ]]; then
    if [[ -d themes/custom/dwars2026 ]]; then
      mv themes/custom/dwars2026 "$dwars_release/failed-dwars2026"
    fi
    mv "$dwars_old" themes/custom/dwars2026
  fi
  vendor/bin/drush state:set system.maintenance_mode 0 -y >/dev/null 2>&1 || true
  vendor/bin/drush cache:rebuild >/dev/null 2>&1 || true
  exit "$dwars_rc"
}
trap dwars_cleanup EXIT

vendor/bin/drush state:set system.maintenance_mode 1 -y
vendor/bin/drush cache:rebuild
test ! -e "$dwars_old"
mv themes/custom/dwars2026 "$dwars_old"
cp -r "$dwars_stage" themes/custom/dwars2026
test "$(awk '/^version:/ { print $2; exit }' themes/custom/dwars2026/dwars2026.info.yml)" = "$dwars_version"
vendor/bin/drush cache:rebuild
test "$(vendor/bin/drush config:get system.theme default --format=string)" = "dwars2026"
DWARS_REMOTE_DEPLOY

dwars_deployed=1
dwars_complete=0
dwars_rollback_on_exit() {
  dwars_rc=$?
  trap - EXIT INT TERM
  if [[ "$dwars_deployed" -eq 1 && "$dwars_complete" -eq 0 ]]; then
    echo "Post-deploy verification failed; restoring the previous theme directory." >&2
    ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
      "$dwars_production_root" "$dwars_backup_dir" "$dwars_release_dir" <<'DWARS_REMOTE_ROLLBACK'
set -Eeuo pipefail
dwars_root="$1"
dwars_backup="$2"
dwars_release="$3"
dwars_old="$dwars_backup/dwars2026-live-directory"
cd "$dwars_root"

dwars_cleanup() {
  dwars_rc=$?
  trap - EXIT
  vendor/bin/drush state:set system.maintenance_mode 0 -y >/dev/null 2>&1 || true
  vendor/bin/drush cache:rebuild >/dev/null 2>&1 || true
  exit "$dwars_rc"
}
trap dwars_cleanup EXIT

vendor/bin/drush state:set system.maintenance_mode 1 -y
vendor/bin/drush cache:rebuild
test -d "$dwars_old"
mv themes/custom/dwars2026 "$dwars_release/failed-postcheck-dwars2026"
mv "$dwars_old" themes/custom/dwars2026
vendor/bin/drush cache:rebuild
DWARS_REMOTE_ROLLBACK
  fi
  exit "$dwars_rc"
}
trap dwars_rollback_on_exit EXIT INT TERM

ssh "${dwars_ssh_options[@]}" "$dwars_ssh_target" bash -s -- \
  "$dwars_production_root" "$dwars_version" "$dwars_error_cursor" <<'DWARS_REMOTE_POSTCHECK'
set -Eeuo pipefail
dwars_root="$1"
dwars_version="$2"
dwars_error_cursor="$3"
cd "$dwars_root"

dwars_updates="$(vendor/bin/drush updatedb:status --format=json)"
test -z "$dwars_updates" || test "$dwars_updates" = "[]"
test "$(vendor/bin/drush state:get system.maintenance_mode)" = "0"
test "$(vendor/bin/drush config:get system.theme default --format=string)" = "dwars2026"
test "$(awk '/^version:/ { print $2; exit }' themes/custom/dwars2026/dwars2026.info.yml)" = "$dwars_version"
test "$(stat -c '%U:%G %a' sites/default/settings.php)" = "dwars:www-data 444"
composer validate --check-lock --no-check-publish
composer audit --locked --no-interaction

dwars_expect_status() {
  dwars_path="$1"
  dwars_expected="$2"
  dwars_actual="$(curl -sS -o /dev/null -w '%{http_code}' "https://dwars.be$dwars_path")"
  if [[ "$dwars_actual" != "$dwars_expected" ]]; then
    echo "$dwars_path returned $dwars_actual, expected $dwars_expected" >&2
    return 1
  fi
}

for dwars_path in \
  / \
  /nl \
  /nl/archive \
  /nl/alle-artikels \
  '/nl/search/node?keys=studentenraad' \
  /nl/taxonomy/term/18 \
  /nl/taxonomy/term/4691 \
  /nl/redactie \
  /nl/freelance \
  /nl/oud-redactie \
  /nl/visie \
  /nl/meewerken \
  /nl/adverteren \
  /nl/contact \
  /nl/artikel/sportief-sprookje \
  /nl/cultuuragenda \
  /nl/content/couleur-cafe \
  /nl/frontpage; do
  dwars_expect_status "$dwars_path" 200
done
dwars_expect_status /nl/production-readiness-missing-page 404
dwars_expect_status /themes/custom/dwars2026/assets/images/dwarslogo_website.png 200

sudo -u www-data /usr/bin/php8.4 vendor/drush/drush/drush.php php:eval \
  '$checker = \Drupal::service("Drupal\\automatic_updates\\Validation\\StatusChecker");
   $checker->run();
   $results = $checker->getResults() ?? [];
   if (count($results) > 0) {
     foreach ($results as $result) {
       fwrite(STDERR, $result->severity . ": " . implode(" | ", $result->messages) . PHP_EOL);
     }
     exit(1);
   }
   echo "Automatic Updates readiness: OK" . PHP_EOL;'

dwars_new_errors="$(vendor/bin/drush php:eval "echo \\Drupal::database()->query('SELECT COUNT(*) FROM {watchdog} WHERE wid > :wid AND severity <= 3', [':wid' => $dwars_error_cursor])->fetchField();")"
if [[ "$dwars_new_errors" != "0" ]]; then
  echo "Drupal recorded $dwars_new_errors new high-severity log entries." >&2
  vendor/bin/drush watchdog:show --severity=3 --count=10 --format=table >&2
  exit 1
fi
DWARS_REMOTE_POSTCHECK

DWARS_LOCAL_ORIGIN=https://dwars.be \
DWARS_VERIFY_OUTPUT="/private/tmp/dwars-theme-production-$dwars_version.json" \
node scripts/verify-theme-local.mjs

dwars_complete=1
trap - EXIT INT TERM
echo "Production deployment complete: dwars2026 $dwars_version ($dwars_commit)"
echo "Backup: $dwars_ssh_target:$dwars_backup_dir"
echo "Release evidence: $dwars_ssh_target:$dwars_release_dir"
