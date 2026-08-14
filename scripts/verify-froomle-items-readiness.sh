#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${FROOMLE_DRUPAL_SOURCE:-/Users/matthias/froomle/froomle-drupal}"
staged_dir="$project_dir/.local-drupal/.local-packages/froomle-drupal"
installed_dir="$project_dir/.local-drupal/modules/contrib/froomle"
expected_pending=""
failed=0

usage() {
  echo "Usage: $0 [--expect-pending ENTITY_ID:GENERATION]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-pending)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      expected_pending="$2"
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ -n "$expected_pending" && ! "$expected_pending" =~ ^[0-9]+:[0-9]+$ ]]; then
  echo "FAIL expected pending value must be ENTITY_ID:GENERATION" >&2
  exit 2
fi

for required_dir in "$source_dir" "$staged_dir" "$installed_dir"; do
  if [[ ! -d "$required_dir" ]]; then
    echo "FAIL missing runtime root: $required_dir" >&2
    failed=1
  fi
done
[[ $failed -eq 0 ]] || exit 1

runtime_manifest() {
  local root="$1"
  local relative
  local -a files=(
    CHANGELOG.md
    LICENSE.txt
    README.md
    SECURITY.md
    composer.json
    froomle.info.yml
    froomle.links.menu.yml
    froomle.permissions.yml
    froomle.routing.yml
    froomle.services.yml
  )
  local -a directories=(config modules src)

  for relative in "${files[@]}"; do
    if [[ -f "$root/$relative" ]]; then
      shasum -a 256 "$root/$relative" | sed "s#  $root/#  #"
    fi
  done
  for relative in "${directories[@]}"; do
    if [[ -d "$root/$relative" ]]; then
      while IFS= read -r -d '' runtime_file; do
        shasum -a 256 "$runtime_file" | sed "s#  $root/#  #"
      done < <(find "$root/$relative" -type f -print0 | LC_ALL=C sort -z)
    fi
  done
}

compare_runtime() {
  local label="$1"
  local candidate="$2"
  local manifest_diff
  if ! manifest_diff="$(diff -u <(runtime_manifest "$source_dir") <(runtime_manifest "$candidate"))"; then
    echo "FAIL source runtime differs from $label" >&2
    sed -n '1,80p' <<<"$manifest_diff" >&2
    if [[ "$(wc -l <<<"$manifest_diff")" -gt 80 ]]; then
      echo "... manifest diff truncated ..." >&2
    fi
    failed=1
    return
  fi
  echo "PASS source runtime matches $label"
}

compare_runtime "Composer staging" "$staged_dir"
compare_runtime "installed Drupal package" "$installed_dir"

service_state=""
if ! service_state="$(
    cd "$project_dir"
    ddev drush php:eval '
    $manager = \Drupal::service("plugin.manager.queue_worker");
    $definitions = $manager->getDefinitions();
    $checks = [
      "automatic_sync_subscriber" => \Drupal::hasService("froomle_items.automatic_sync_subscriber"),
      "backfill_batch_runner" => \Drupal::hasService("froomle_items.backfill_batch_runner"),
      "editorial_queue_worker" => isset($definitions["froomle_items_sync"]),
      "backfill_queue_worker" => isset($definitions["froomle_items_backfill_sync"]),
      "automatic_delivery" => \Drupal::config("froomle_items.settings")->get("automatic_delivery") === TRUE,
    ];
    foreach ($checks as $name => $value) {
      print $name . "=" . ($value ? "1" : "0") . PHP_EOL;
    }
  '
)"; then
  echo "FAIL could not inspect the active Drupal service container" >&2
  failed=1
fi

for service_check in automatic_sync_subscriber backfill_batch_runner editorial_queue_worker backfill_queue_worker automatic_delivery; do
  if grep -qx "$service_check=1" <<<"$service_state"; then
    echo "PASS active Drupal container: $service_check"
  else
    echo "FAIL active Drupal container: $service_check" >&2
    failed=1
  fi
done

database_updates=""
database_update_status=0
database_updates="$(cd "$project_dir" && ddev drush updatedb:status --format=list 2>&1)" || database_update_status=$?
if [[ $database_update_status -eq 0 && ( -z "$database_updates" || "$database_updates" == *"No database updates required"* || "$database_updates" == *"No pending updates"* ) ]]; then
  echo "PASS no pending Drupal database updates"
else
  echo "FAIL pending or unreadable Drupal database updates" >&2
  echo "$database_updates" >&2
  failed=1
fi

expected_entity=0
expected_generation=0
if [[ -n "$expected_pending" ]]; then
  expected_entity="${expected_pending%%:*}"
  expected_generation="${expected_pending##*:}"
fi

queue_state=""
if ! queue_state="$(
    cd "$project_dir"
    ddev drush sql:query "
    SELECT
      (SELECT COUNT(*) FROM queue WHERE name = 'froomle_items_sync'),
      (SELECT COUNT(*) FROM queue WHERE name = 'froomle_items_backfill_sync'),
      (SELECT COUNT(*) FROM queue WHERE name = 'froomle_items_backfill'),
      (SELECT COUNT(*) FROM froomle_items_sync WHERE generation > accepted_generation),
      (SELECT COUNT(*) FROM froomle_items_sync WHERE entity_id = '$expected_entity' AND generation = '$expected_generation' AND generation > accepted_generation),
      (SELECT COUNT(*) FROM froomle_items_backfill),
      (
        SELECT COUNT(*)
        FROM froomle_items_backfill job
        WHERE job.status <> 'completed'
          OR EXISTS (
            SELECT 1
            FROM froomle_items_backfill_item item
            INNER JOIN froomle_items_sync sync ON sync.id = item.sync_id
            WHERE item.job_id = job.id
              AND sync.generation <> sync.accepted_generation
          )
      ),
      (
        SELECT COUNT(*)
        FROM froomle_items_backfill_item item
        INNER JOIN froomle_items_sync sync ON sync.id = item.sync_id
        WHERE sync.generation <> sync.accepted_generation
      );
  "
)"; then
  echo "FAIL could not inspect Drupal queue state" >&2
  failed=1
  queue_state="-1 -1 -1 -1 -1 -1 -1 -1"
fi
read -r editorial_queue backfill_queue enumeration_queue pending_rows expected_rows backfill_jobs blocking_backfill_jobs unresolved_backfill_items <<<"$queue_state"

echo "STATE editorial_queue=$editorial_queue backfill_queue=$backfill_queue enumeration_queue=$enumeration_queue pending_rows=$pending_rows backfill_jobs=$backfill_jobs blocking_backfill_jobs=$blocking_backfill_jobs unresolved_backfill_items=$unresolved_backfill_items"

if [[ "$backfill_queue" != "0" || "$blocking_backfill_jobs" != "0" || "$unresolved_backfill_items" != "0" ]]; then
  echo "FAIL unfinished backfill work exists" >&2
  failed=1
elif [[ "$enumeration_queue" != "0" ]]; then
  echo "PASS enumeration queue contains only terminal recovery wake-ups"
else
  echo "PASS no backfill work is pending"
fi

if [[ -n "$expected_pending" ]]; then
  if [[ "$editorial_queue" != "1" || "$pending_rows" != "1" || "$expected_rows" != "1" ]]; then
    echo "FAIL queue state does not exactly match expected pending $expected_pending" >&2
    failed=1
  else
    echo "PASS exact pending editorial item is $expected_pending"
  fi
elif [[ "$editorial_queue" != "0" || "$pending_rows" != "0" ]]; then
  echo "FAIL pending editorial work exists; declare it with --expect-pending" >&2
  failed=1
else
  echo "PASS no pending editorial work"
fi

if [[ $failed -ne 0 ]]; then
  echo "NOT READY" >&2
  exit 1
fi

echo "READY"
