#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

function readEnvFile(path) {
  try {
    return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line && !line.trim().startsWith('#') && line.includes('=')).map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }));
  } catch { return {}; }
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.production') };
const env = { ...fileEnv, ...process.env };
const rawUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.VITE_HASHIBOT_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || '';
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_HASHIBOT_SUPABASE_ANON_KEY || env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const explicitToken = env.HASHIBOT_RUNTIME_PROOF_TOKEN || env.HASHIBOT_CRON_TOKEN || env.INTERNAL_CRON_TOKEN || env.SUPABASE_SERVICE_ROLE_KEY || anonKey;
const candidateUrls = [...new Set([
  rawUrl,
  'https://uqiwbzfcntlcyyewawfc.supabase.co',
  'https://uqiwbzfcntlcvyewawfc.supabase.co',
].filter(Boolean).map((u) => u.replace(/\/$/, '')))];

const actionNames = [
  'status',
  'diagnose_bybit_testnet_connection',
  'show_executable_universe',
  'place_tiny_binance_test_order',
  'place_tiny_bybit_test_order',
  'run_binance_monitor_now',
  'run_bybit_monitor_now',
];

async function invoke(url, action) {
  const started = new Date().toISOString();
  try {
    const res = await fetch(`${url}/functions/v1/binance-testnet-execution`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${explicitToken}`,
        'x-hashibot-cron-token': explicitToken,
      },
      body: JSON.stringify({ action }),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { url, action, invoked_at: started, http_status: res.status, ok: res.ok, json, text: json ? undefined : text.slice(0, 4000) };
  } catch (error) {
    return { url, action, invoked_at: started, ok: false, runtime_invoked: false, error_name: error?.name || 'Error', error_message: error?.message || String(error), error_code: error?.cause?.code || error?.code || null, error_host: error?.cause?.hostname || null };
  }
}

function yesNo(value) { return value === true ? 'YES' : 'NO'; }
function providerFromResult(results, action) { return results.find((r) => r.action === action && r.json)?.json ?? null; }
function orderProof(payload, provider) {
  if (!payload) return { provider, submitted: 'NO', blocker: 'runtime_action_not_invoked' };
  const p = payload.provider === provider ? payload : Array.isArray(payload.results) ? payload.results.find((r) => r.provider === provider) : null;
  return {
    provider,
    submitted: yesNo(Boolean(p?.submitted_order || p?.provider_order_id || p?.entry_order_id)),
    symbol: p?.symbol ?? payload.latest_symbol ?? null,
    order_id: p?.provider_order_id ?? p?.entry_order_id ?? null,
    execution_id: p?.execution_id ?? null,
    status: p?.status ?? null,
    blocker: p?.blocker ?? p?.reason_code ?? p?.reason ?? p?.error ?? payload?.reason ?? null,
  };
}

function mdTable(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return [`| ${keys.join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${keys.map((k) => String(row[k] ?? '—').replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
}

const allResults = [];
for (const url of candidateUrls) {
  const status = await invoke(url, 'status');
  allResults.push(status);
  if (status.ok) {
    for (const action of actionNames.filter((a) => a !== 'status')) allResults.push(await invoke(url, action));
    break;
  }
}
const used = allResults.find((r) => r.ok)?.url ?? candidateUrls[0] ?? '';
const usedResults = allResults.filter((r) => r.url === used);
const statusPayload = providerFromResult(usedResults, 'status');
const bybitDiag = providerFromResult(usedResults, 'diagnose_bybit_testnet_connection');
const binanceOrder = orderProof(providerFromResult(usedResults, 'place_tiny_binance_test_order'), 'binance');
const bybitOrder = orderProof(providerFromResult(usedResults, 'place_tiny_bybit_test_order'), 'bybit');
const binanceMonitor = providerFromResult(usedResults, 'run_binance_monitor_now');
const bybitMonitor = providerFromResult(usedResults, 'run_bybit_monitor_now');
const invocationBlocker = allResults.find((r) => !r.ok && !r.runtime_invoked);

mkdirSync('reports/execution', { recursive: true });
const generatedAt = new Date().toISOString();
const invocationSummary = allResults.map(({ url, action, http_status, ok, error_name, error_message, error_code, error_host }) => ({ url, action, ok, http_status, error_name, error_code, error_host, error_message }));

const providerRows = [
  { provider: 'binance', wallet_reachable: yesNo(Boolean(statusPayload?.account_state)), positions_reachable: yesNo(Array.isArray(statusPayload?.account_state?.positions)), open_orders_reachable: yesNo(typeof statusPayload?.account_state?.openOrderCount === 'number'), instruments_reachable: yesNo(Boolean((providerFromResult(usedResults, 'show_executable_universe')?.binance_count ?? 0) > 0)), account_reachable: yesNo(Boolean(statusPayload?.account_state)), provider_control_status: statusPayload?.provider_controls?.find?.((p) => p.provider_name === 'binance')?.status ?? 'not_returned', provider_truth_snapshot_status: statusPayload?.provider_truth?.find?.((p) => p.provider === 'binance')?.health_status ?? 'not_returned', last_successful_sync_time: statusPayload?.settings?.latest_successful_sync_at ?? 'not_returned', latest_error: statusPayload?.latest_error?.error_message ?? 'not_returned' },
  { provider: 'bybit', wallet_reachable: yesNo(Boolean(bybitDiag?.wallet_reachable)), positions_reachable: yesNo(Boolean(bybitDiag?.positions_ok)), open_orders_reachable: yesNo(Boolean(bybitDiag?.orders_ok)), instruments_reachable: yesNo(Boolean(bybitDiag?.linear_instruments_reachable)), account_reachable: yesNo(Boolean(bybitDiag?.account_reachable)), provider_control_status: bybitDiag?.current_provider_status ?? 'not_returned', provider_truth_snapshot_status: bybitDiag?.checks?.current_provider_status ?? 'not_returned', last_successful_sync_time: statusPayload?.settings?.bybit_latest_successful_sync_at ?? 'not_returned', latest_error: bybitDiag?.latest_error_message ?? bybitDiag?.error_reason ?? 'not_returned' },
];

const finalRows = [
  { Capability: 'Entry execution proven', Binance: binanceOrder.submitted, Bybit: bybitOrder.submitted },
  { Capability: 'SL proven', Binance: yesNo(Boolean(binanceOrder.sl_order_id)), Bybit: yesNo(Boolean(bybitOrder.sl_order_id)) },
  { Capability: 'TP1 proven', Binance: yesNo(Boolean(binanceOrder.tp1_order_id)), Bybit: yesNo(Boolean(bybitOrder.tp1_order_id)) },
  { Capability: 'TP2 proven', Binance: yesNo(Boolean(binanceOrder.tp2_order_id)), Bybit: yesNo(Boolean(bybitOrder.tp2_order_id)) },
  { Capability: 'Position detection proven', Binance: providerRows[0].positions_reachable, Bybit: providerRows[1].positions_reachable },
  { Capability: 'Protection repair proven', Binance: yesNo(Boolean(binanceMonitor?.repairs_successful || binanceMonitor?.stats?.repairs_successful)), Bybit: yesNo(Boolean(bybitMonitor?.repairs_successful || bybitMonitor?.stats?.repairs_successful)) },
  { Capability: 'Telegram lifecycle proven', Binance: yesNo(Boolean(statusPayload?.telegram_events?.some?.((e) => String(e.event_type ?? e.text ?? '').toLowerCase().includes('binance')))), Bybit: yesNo(Boolean(statusPayload?.telegram_events?.some?.((e) => String(e.event_type ?? e.text ?? '').toLowerCase().includes('bybit')))) },
  { Capability: '1-minute monitor proven', Binance: yesNo(Boolean(binanceMonitor?.success)), Bybit: yesNo(Boolean(bybitMonitor?.success)) },
];

const blockerText = invocationBlocker ? `\n\n## Runtime invocation blocker\n\nExact blocker: ${invocationBlocker.error_code ?? invocationBlocker.error_name}: ${invocationBlocker.error_message}${invocationBlocker.error_host ? ` (${invocationBlocker.error_host})` : ''}\n` : '';
writeFileSync('reports/execution/runtime-proof-binance-bybit.md', `# Binance / Bybit Deployed Runtime Proof\n\nGenerated at: ${generatedAt}\n\nThis report contains only deployed runtime invocation results. It does not claim code-path readiness.\n${blockerText}\n## Provider runtime truth\n\n${mdTable(providerRows)}\n\n## Tiny test order proof\n\n${mdTable([binanceOrder, bybitOrder])}\n\n## Monitor proof\n\n${mdTable([{ provider: 'binance', invoked: yesNo(Boolean(binanceMonitor)), success: yesNo(Boolean(binanceMonitor?.success)), latest_error: binanceMonitor?.error ?? binanceMonitor?.latest_error ?? 'not_returned' }, { provider: 'bybit', invoked: yesNo(Boolean(bybitMonitor)), success: yesNo(Boolean(bybitMonitor?.success)), latest_error: bybitMonitor?.error ?? bybitMonitor?.latest_error ?? 'not_returned' }])}\n\n## Raw invocation summary\n\n\`\`\`json\n${JSON.stringify(invocationSummary, null, 2)}\n\`\`\`\n`);
writeFileSync('reports/execution/bybit-telegram-gap.md', `# Bybit Telegram Gap Runtime Proof\n\nGenerated at: ${generatedAt}\n\nBybit Telegram lifecycle proven: ${finalRows.find((r) => r.Capability === 'Telegram lifecycle proven')?.Bybit}\n\nExact runtime reason when zero: ${bybitOrder.submitted === 'NO' ? (bybitOrder.blocker || invocationBlocker?.error_message || 'no Bybit order submitted') : 'Bybit submitted; inspect Telegram route/lifecycle rows in raw status payload'}\n\n## Bybit order proof\n\n${mdTable([bybitOrder])}\n\n## Runtime invocation summary\n\n\`\`\`json\n${JSON.stringify(invocationSummary, null, 2)}\n\`\`\`\n`);
writeFileSync('reports/execution/provider-runtime-truth-table.md', `# Provider Runtime Truth Table\n\nGenerated at: ${generatedAt}\n\n${mdTable(finalRows)}\n\n## Provider reachability\n\n${mdTable(providerRows)}\n`);
console.log(JSON.stringify({ generatedAt, usedUrl: used, invocationBlocker, providerRows, binanceOrder, bybitOrder, finalRows }, null, 2));
