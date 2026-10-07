#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable database with all migrations applied}"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/phaseO/database/phaseOCompletion.sql
