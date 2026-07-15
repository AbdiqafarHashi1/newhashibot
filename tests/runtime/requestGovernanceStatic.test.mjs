import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const governance = readFileSync('src/lib/requestGovernance.ts', 'utf8');
const live = readFileSync('src/hooks/useAdminLiveState.ts', 'utf8');
const operator = readFileSync('src/pages/admin/operator/OperatorPanel.tsx', 'utf8');
const truth = readFileSync('src/lib/operatorTruth.ts', 'utf8');

assert.match(governance, /const inFlight = new Map/, 'request governance deduplicates identical in-flight requests');
assert.match(governance, /document\.visibilityState === 'hidden'/, 'polling pauses while hidden');
assert.match(governance, /isOperatorActionRunning/, 'polling can pause while operator action runs');
assert.match(governance, /\[400, 401, 403, 404\]/, 'deterministic client/auth/not-found errors are not retried forever');
assert.match(governance, /markEndpointBroken/, 'broken endpoints enter degraded blocked state');
assert.match(governance, /running = true/, 'polling prevents overlapping cycles');
assert.match(governance, /controller\?\.abort/, 'polling aborts obsolete request on unmount');

assert.match(live, /startGovernedPolling/, 'admin live state uses governed polling');
assert.match(live, /intervalMs: 60_000/, 'admin live state request budget is 60 second live refresh');
assert.doesNotMatch(live, /intelligence_feed_health/, 'legacy intelligence_feed_health source is not queried by live state');
assert.doesNotMatch(live, /provider_status'\)/, 'legacy provider_status table is not queried by live state');
assert.match(live, /admin_runtime_overview_read_model/, 'canonical runtime overview read model is used');
assert.match(live, /admin_telegram_delivery_health_read_model/, 'canonical telegram health read model is used');

assert.match(operator, /intervalMs: 60_000/, 'operator panel polling budget is 60 seconds, not 5 seconds');
assert.match(operator, /withOperatorAction\(\(\) => callEdgeFunction/, 'operator POST starts through shared immediate transport wrapper');
assert.doesNotMatch(operator, /Promise\.allSettled\(\[withTimeout\(refresh\(\)/, 'operator action is not followed by awaited background refresh cleanup');

for (const legacy of ['telegram_router_audit', 'runtime_proof_view', 'scheduler_truth_view', 'execution_monitor_heartbeats']) {
  assert.doesNotMatch(truth, new RegExp(`rows\\('${legacy}`), `operator truth does not query legacy/missing source ${legacy}`);
}
for (const canonical of ['admin_active_trade_truth_read_model', 'admin_execution_orders_read_model', 'admin_runtime_overview_read_model', 'admin_telegram_delivery_health_read_model']) {
  assert.match(truth, new RegExp(canonical), `operator truth uses canonical source ${canonical}`);
}

console.log('request governance static contract tests passed');
