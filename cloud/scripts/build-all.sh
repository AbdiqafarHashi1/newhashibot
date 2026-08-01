#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
for directory in cloud/services/*; do
  test -d "$directory" || continue
  cloud/scripts/build.sh "$(basename "$directory")"
done
