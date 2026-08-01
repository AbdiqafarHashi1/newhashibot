#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../infrastructure/terraform"
if command -v tofu >/dev/null; then tofu fmt -check -recursive; elif command -v terraform >/dev/null; then terraform fmt -check -recursive; else echo "terraform/tofu unavailable; format validation skipped" >&2; fi
