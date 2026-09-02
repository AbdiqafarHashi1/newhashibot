#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .tmp/telegram-flow-verify
npx tsc --outDir .tmp/telegram-flow-verify --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --types node --skipLibCheck scripts/telegram-flow-verify.ts
node .tmp/telegram-flow-verify/scripts/telegram-flow-verify.js
