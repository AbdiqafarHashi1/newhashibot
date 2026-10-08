#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
npm audit --omit=dev
