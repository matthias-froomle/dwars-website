#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_dir="$project_root/artifacts"
archive="$artifact_dir/dwars-editions-166-169.tar.gz"
files=(
  public/edities/dwars-166.pdf
  public/edities/dwars-167.pdf
  public/edities/dwars-168.pdf
  public/edities/dwars-169.pdf
  public/edities-covers/cover-166.png
  public/edities-covers/cover-167.png
  public/edities-covers/cover-168.png
  public/edities-covers/cover-169.png
)

for file in "${files[@]}"; do
  if [[ ! -f "$project_root/$file" ]]; then
    echo "Missing edition asset: $file" >&2
    exit 1
  fi
done

mkdir -p "$artifact_dir"
tar -czf "$archive" -C "$project_root" "${files[@]}"
echo "$archive"
