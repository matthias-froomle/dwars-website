#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_theme="$project_root/drupal-theme/dwars2026"
target_theme="$project_root/.local-drupal/themes/custom/dwars2026"

if [[ ! -d "$project_root/.local-drupal/themes/custom" ]]; then
  echo "Local Drupal is missing. Run scripts/restore-drupal-local.sh first." >&2
  exit 1
fi

mkdir -p "$target_theme"
rsync -a --delete --exclude node_modules "$source_theme/" "$target_theme/"
echo "Synced dwars2026 into the local Drupal tree."
