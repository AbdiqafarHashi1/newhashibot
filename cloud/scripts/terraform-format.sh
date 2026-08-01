#!/usr/bin/env bash
set -euo pipefail; command -v terraform >/dev/null || { echo terraform-required >&2; exit 127; }; if [[ "${1:-}" == -check ]]; then terraform fmt -check cloud/infrastructure/terraform/environments/demo; else terraform fmt cloud/infrastructure/terraform/environments/demo; fi
