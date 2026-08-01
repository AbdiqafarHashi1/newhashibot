#!/usr/bin/env bash
set -euo pipefail; root=cloud/infrastructure/terraform/environments/demo; terraform -chdir="$root" init -backend=false -input=false; terraform -chdir="$root" validate
