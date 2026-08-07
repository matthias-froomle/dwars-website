#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:---dry-run}"

if [[ "$mode" != "--dry-run" && "$mode" != "--apply" ]]; then
  echo "Usage: $0 [--dry-run|--apply]" >&2
  exit 1
fi

cd "$project_root"
ddev drush php:script /var/www/html/scripts/import-editions.php -- "$mode"
