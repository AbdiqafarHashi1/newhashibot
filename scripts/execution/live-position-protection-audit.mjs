#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const BINANCE_BASE = process.env.BINANCE_TESTNET_BASE_URL || 'https://demo-fapi.binance.com';
const REPORT_PATH = 'reports/execution/live-position-protection-report.md';

function qs(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function sign(secret, payload) { return createHmac('sha256', secret).update(payload).digest('hex'); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

async function binanceSigned(path, params = {}) {
  const apiKey = process.env.BINANCE_TESTNET_API_KEY || '';
  const apiSecret = process.env.BINANCE_TESTNET_API_SECRET || '';
  if (!apiKey || !apiSecret) throw new Error('BINANCE_TESTNET_API_KEY/BINANCE_TESTNET_API_SECRET not set in this environment');
  if (BINANCE_BASE !== 'https://demo-fapi.binance.com') throw new Error('BINANCE_TESTNET_BASE_URL must be https://demo-fapi.binance.com for this audit');
  const query = qs({ ...params, recvWindow: 5000, timestamp: Date.now() });
  const url = `${BINANCE_BASE}${path}?${query}&signature=${sign(apiSecret, query)}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Binance ${path} failed ${res.status}: ${body.msg ?? res.statusText}`);
  return body;
}

async function bybitWalletAuth() {
  const apiKey = process.env.BYBIT_TESTNET_API_KEY || '';
  const apiSecret = process.env.BYBIT_TESTNET_API_SECRET || '';
  const enabled = String(process.env.BYBIT_TESTNET_ENABLED || '').toLowerCase() === 'true';
  const base = (process.env.BYBIT_TESTNET_BASE_URL || 'https://api-testnet.bybit.com').replace(/\/$/, '');
  const recvWindow = 5000;
  const timestamp = String(Date.now());
  const query = qs({ accountType: 'UNIFIED' });
  const preSign = `${timestamp}${apiKey}${recvWindow}${query}`;
  const signature = apiSecret ? sign(apiSecret, preSign) : '';
  const audit = { enabled, auth_ok: false, response_code: 0, retCode: undefined, retMsg: undefined, key_length: apiKey.length, secret_length: apiSecret.length, query_string: query, signature_length: signature.length, header_names: ['X-BAPI-API-KEY', 'X-BAPI-TIMESTAMP', 'X-BAPI-RECV-WINDOW', 'X-BAPI-SIGN', 'X-BAPI-SIGN-TYPE'], error: '' };
  if (!apiKey || !apiSecret) { audit.error = 'BYBIT_TESTNET_API_KEY/BYBIT_TESTNET_API_SECRET not set in this environment'; return audit; }
  if (!base.includes('testnet')) { audit.error = 'BYBIT_TESTNET_BASE_URL must include testnet'; return audit; }
  try {
    const res = await fetch(`${base}/v5/account/wallet-balance?${query}`, { method: 'GET', headers: { 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': String(recvWindow), 'X-BAPI-SIGN': signature, 'X-BAPI-SIGN-TYPE': '2' }, signal: AbortSignal.timeout(15000) });
    audit.response_code = res.status;
    const body = await res.json().catch(() => ({}));
    audit.retCode = body.retCode;
    audit.retMsg = body.retMsg;
    audit.auth_ok = res.ok && body.retCode === 0;
  } catch (error) { audit.error = error instanceof Error ? error.message : String(error); }
  return audit;
}

async function fetchExecutionDb() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_HASHIBOT_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRole) return { available: false, rows: [], reason: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set in this environment' };
  const statuses = 'entry_filled,protected,protected_native,protected_managed,pending_protection,protection_pending,protection_failed,partially_closed,pending_managed_protection';
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/execution_orders?select=*&status=in.(${statuses})`;
  const res = await fetch(url, { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }, signal: AbortSignal.timeout(15000) });
  const rows = await res.json().catch(() => []);
  if (!res.ok) return { available: false, rows: [], reason: `Supabase execution_orders fetch failed ${res.status}: ${JSON.stringify(rows).slice(0, 300)}` };
  return { available: true, rows, reason: '' };
}

function orderId(order) { return String(order.algoId ?? order.orderId ?? order.clientAlgoId ?? order.clientOrderId ?? ''); }
function orderKind(order) { const raw = String(order.type ?? order.orderType ?? order.origType ?? '').toUpperCase(); if (raw.includes('STOP')) return 'SL'; if (raw.includes('TAKE_PROFIT')) return 'TP'; return raw || 'UNKNOWN'; }
function isReduceOnly(order) { return order.reduceOnly === true || String(order.reduceOnly).toLowerCase() === 'true' || order.closePosition === true || String(order.closePosition).toLowerCase() === 'true'; }
function closeSide(positionAmt) { return positionAmt > 0 ? 'SELL' : 'BUY'; }
function mdBool(value) { return value ? 'YES' : 'NO'; }

function classifyPosition(position, orders, dbRows) {
  const amt = n(position.positionAmt);
  const close = closeSide(amt);
  const protectionOrders = orders.filter((order) => String(order.symbol) === String(position.symbol) && String(order.side).toUpperCase() === close && isReduceOnly(order));
  const slOrders = protectionOrders.filter((order) => orderKind(order) === 'SL');
  const tpOrders = protectionOrders.filter((order) => orderKind(order) === 'TP');
  const slPresent = slOrders.length > 0;
  const tp1Present = tpOrders.length >= 1;
  const tp2Present = tpOrders.length >= 2;
  const matchingDb = dbRows.filter((row) => String(row.executed_symbol ?? row.symbol) === String(position.symbol));
  const monitorVerified = matchingDb.some((row) => row.native_protection_verified === true || row.protection_status === 'protected_native' || row.protection_status === 'protected_managed');
  const profitLockActive = matchingDb.some((row) => row.profit_lock_sl_active === true || row.profit_lock_status === 'locked');
  const staleMonitorState = matchingDb.length > 0 && !matchingDb.some((row) => { const checked = Date.parse(row.last_monitor_checked_at ?? ''); return Number.isFinite(checked) && Date.now() - checked <= 180_000; });
  const orphanPosition = matchingDb.length === 0;
  const duplicateProtection = slOrders.length > 1 || tpOrders.length > 2;
  const staleProtection = matchingDb.some((row) => String(row.protection_status ?? '').includes('protected')) && (!slPresent || !tp1Present || !tp2Present);
  const warnings = [];
  const critical = [];
  if (!slPresent) critical.push('missing SL');
  if (!tp1Present) warnings.push('missing TP1');
  if (!tp2Present) warnings.push('missing TP2');
  if (orphanPosition) critical.push('orphan position: exchange position has no active execution DB row');
  if (duplicateProtection) warnings.push('duplicate protection orders');
  if (staleProtection) critical.push('stale protection: DB says protected but exchange protection incomplete');
  if (staleMonitorState) warnings.push('stale monitor state');
  const classification = critical.length ? 'CRITICAL' : warnings.length ? 'WARNING' : 'SAFE';
  return { symbol: position.symbol, side: amt > 0 ? 'LONG' : 'SHORT', size: Math.abs(amt), entry: n(position.entryPrice), mark: n(position.markPrice), pnl: n(position.unRealizedProfit ?? position.unrealizedProfit), slPresent, tp1Present, tp2Present, profitLockActive, protectionVerified: slPresent && tp1Present && tp2Present, monitorVerified, recoveryRequired: !slPresent || !tp1Present || !tp2Present || orphanPosition || staleProtection, duplicateProtection, staleProtection, staleMonitorState, orphanPosition, warnings, critical, classification, protectionOrderIds: protectionOrders.map(orderId).filter(Boolean) };
}

function detectOrphanOrders(positions, orders) { const symbolsWithPositions = new Set(positions.map((position) => String(position.symbol))); return orders.filter((order) => isReduceOnly(order) && !symbolsWithPositions.has(String(order.symbol))); }

async function main() {
  const generatedAt = new Date().toISOString();
  let positions = [], openOrders = [], exchangeError = '';
  try {
    const [positionRisk, regularOrders, algoOrders] = await Promise.all([binanceSigned('/fapi/v2/positionRisk'), binanceSigned('/fapi/v1/openOrders'), binanceSigned('/fapi/v1/openAlgoOrders', { algoType: 'CONDITIONAL' }).catch(() => [])]);
    positions = positionRisk.filter((position) => Math.abs(n(position.positionAmt)) > 0);
    openOrders = [...regularOrders, ...(Array.isArray(algoOrders) ? algoOrders : [])];
  } catch (error) { exchangeError = error instanceof Error ? error.message : String(error); }
  const db = await fetchExecutionDb().catch((error) => ({ available: false, rows: [], reason: error instanceof Error ? error.message : String(error) }));
  const bybit = await bybitWalletAuth();
  const rows = exchangeError ? [] : positions.map((position) => classifyPosition(position, openOrders, db.available ? db.rows : []));
  const orphanOrders = exchangeError ? [] : detectOrphanOrders(positions, openOrders);
  const safe = rows.filter((row) => row.classification === 'SAFE');
  const warning = rows.filter((row) => row.classification === 'WARNING');
  const critical = rows.filter((row) => row.classification === 'CRITICAL');
  const lines = ['# OPEN POSITION PROTECTION REPORT', '', `Generated: ${generatedAt}`, '', '## Scope and safety', '', '- Read-only audit only. No Binance orders and no Bybit orders were placed.', '- Position classification is based on exchange positions and exchange open orders first; database rows are used only to detect orphan/stale monitor or execution state.', '- Any position missing SL is CRITICAL. Any position missing TP1 or TP2 is WARNING unless a critical condition is also present.', '', '## Binance exchange fetch status', ''];
  lines.push(exchangeError ? `- Status: FAILED — ${exchangeError}` : '- Status: OK');
  lines.push(`- Exchange positions fetched: ${positions.length}`, `- Exchange open orders fetched: ${openOrders.length}`, `- Execution database available: ${db.available ? 'YES' : `NO — ${db.reason}`}`, '', '## Bybit auth retest', '', `- Enabled: ${mdBool(bybit.enabled)}`, `- auth_ok: ${mdBool(bybit.auth_ok)}`, `- response_code: ${bybit.response_code}`, `- retCode: ${bybit.retCode ?? 'n/a'}`, `- retMsg: ${bybit.retMsg ?? bybit.error ?? 'n/a'}`, `- key_length: ${bybit.key_length}`, `- secret_length: ${bybit.secret_length}`, `- signature_length: ${bybit.signature_length}`, `- query_string: ${bybit.query_string}`, '', '## Summary', '', `- total positions: ${rows.length}`, `- safe positions: ${safe.length}${safe.length ? ` (${safe.map((row) => row.symbol).join(', ')})` : ''}`, `- warning positions: ${warning.length}${warning.length ? ` (${warning.map((row) => row.symbol).join(', ')})` : ''}`, `- critical positions: ${critical.length}${critical.length ? ` (${critical.map((row) => row.symbol).join(', ')})` : ''}`, `- orphan protection orders: ${orphanOrders.length}${orphanOrders.length ? ` (${orphanOrders.map((order) => `${order.symbol}:${orderId(order)}`).join(', ')})` : ''}`, '', '## Position details', '');
  if (!rows.length) lines.push(exchangeError ? 'No position details are available because Binance exchange fetch failed.' : 'No open Binance positions were returned by exchange truth.');
  else {
    lines.push('| classification | symbol | side | size | entry | mark | pnl | SL | TP1 | TP2 | profit lock | protection verified | monitor verified | recovery required | reasons |', '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const row of rows) lines.push(`| ${row.classification} | ${row.symbol} | ${row.side} | ${row.size} | ${row.entry} | ${row.mark} | ${row.pnl} | ${mdBool(row.slPresent)} | ${mdBool(row.tp1Present)} | ${mdBool(row.tp2Present)} | ${mdBool(row.profitLockActive)} | ${mdBool(row.protectionVerified)} | ${mdBool(row.monitorVerified)} | ${mdBool(row.recoveryRequired)} | ${[...row.critical, ...row.warnings].join('; ') || 'exchange SL/TP1/TP2 present'} |`);
  }
  lines.push('', '## Orphan order details', '');
  if (!orphanOrders.length) lines.push('No reduce-only orphan protection orders were detected from exchange truth.');
  else {
    lines.push('| symbol | side | type | order id | trigger/stop | reduce only |', '| --- | --- | --- | --- | ---: | --- |');
    for (const order of orphanOrders) lines.push(`| ${order.symbol} | ${order.side} | ${order.type ?? order.orderType ?? ''} | ${orderId(order)} | ${order.triggerPrice ?? order.stopPrice ?? order.price ?? ''} | ${mdBool(isReduceOnly(order))} |`);
  }
  lines.push('', '## Conclusion', '');
  if (exchangeError) lines.push('Protection truth is NOT proven in this workspace because Binance exchange truth could not be fetched. Run this script in the deployed/secret-bearing environment and attach the regenerated report.');
  else if (critical.length) lines.push(`Protection truth is CRITICAL. Symbols requiring immediate recovery: ${critical.map((row) => row.symbol).join(', ')}.`);
  else if (warning.length) lines.push(`Protection truth is WARNING. Symbols missing TP1/TP2 or stale monitor confirmation: ${warning.map((row) => row.symbol).join(', ')}.`);
  else lines.push('Protection truth is SAFE for all currently open Binance positions returned by exchange truth.');
  lines.push('');
  mkdirSync('reports/execution', { recursive: true });
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(JSON.stringify({ total_positions: rows.length, safe_positions: safe.length, warning_positions: warning.length, critical_positions: critical.length, safe_symbols: safe.map((row) => row.symbol), warning_symbols: warning.map((row) => row.symbol), critical_symbols: critical.map((row) => row.symbol), exchange_error: exchangeError || null, bybit_auth_ok: bybit.auth_ok }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
