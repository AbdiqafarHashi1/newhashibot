import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createV2PlatformApiClient } from '../../apps/web-runtime/src/api-client.js';

const migration = readFileSync('supabase/migrations/20260705230000_production_hardening_retention.sql', 'utf8');
const platformApi = readFileSync('supabase/functions/platform-api/index.ts', 'utf8');
const hardening = readFileSync('supabase/functions/_shared/hardening.ts', 'utf8');

test('retention migration defines archive, cleanup, monitoring summary, and guarded dev reset', () => {
  assert.match(migration, /platform_archive_events/);
  assert.match(migration, /v2_cleanup_retained_data/);
  assert.match(migration, /v2_compact_monitoring_summary/);
  assert.match(migration, /v2_dev_reset/);
  assert.match(migration, /RESET HASHIBOT V2 NONPROD/);
  assert.match(migration, /dev reset is disabled in production/);
  assert.match(migration, /active live\/runtime executors block reset/);
});

test('platform api exposes compact monitoring, retention cleanup, and admin-only reset actions', () => {
  assert.match(platformApi, /"monitoring_summary"/);
  assert.match(platformApi, /"retention_cleanup"/);
  assert.match(platformApi, /"dev_reset"/);
  assert.match(platformApi, /dev reset requires admin\/owner role/);
  assert.match(platformApi, /v2_compact_monitoring_summary/);
});

test('shared hardening utilities sanitize secrets and reject transient storage payloads', () => {
  assert.match(hardening, /sanitizePayload/);
  assert.match(hardening, /secret\|password\|token/);
  assert.match(hardening, /candles\|ticks\|rawCandles\|fullHistory/);
  assert.match(hardening, /assertOwnership/);
  assert.match(hardening, /requireRole/);
});

test('production api client defaults to real mode and empty reads instead of mock activity', () => {
  const client = createV2PlatformApiClient({ fetchImpl: async () => new Response(JSON.stringify({ ok: true, success: true }), { status: 200 }) });
  assert.equal(client.mode, 'real');
  assert.deepEqual(client.read.signals(), []);
  assert.deepEqual(client.read.trades(), []);
  assert.deepEqual(client.read.executors(), []);
});

test('mock data remains available only through explicit mock mode', () => {
  const client = createV2PlatformApiClient({ mode: 'mock' });
  assert.equal(client.mode, 'mock');
  assert.ok(client.read.signals().length > 0);
});

test('v2 code does not import from legacy root app paths', () => {
  const roots = ['apps', 'packages', 'services', 'execution', 'supabase'];
  for (const root of roots) {
    const stack = [join(process.cwd(), root)];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8');
          assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/\.\.\/(src|app|pages|components)\//, full);
        }
      }
    }
  }
});
