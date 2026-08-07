#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
"$project_root/scripts/sync-theme-local.sh"
ddev drush theme:enable dwars2026 -y
ddev drush config:set system.theme default dwars2026 -y
ddev drush cache:rebuild
echo "dwars2026 is active locally. dwars2025 remains installed for rollback."
