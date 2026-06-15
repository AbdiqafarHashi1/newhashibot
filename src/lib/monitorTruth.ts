export type MonitorTruthLevel = 'healthy' | 'warning' | 'critical' | 'stale';

export interface MonitorTruthInput {
  latest_monitor_run_at?: string | null;
  latest_account_state_at?: string | null;
  latest_monitor_status?: string | null;
  latest_monitor_error?: string | null;
  latest_sync_error?: string | null;
  latest_monitor_result?: Record<string, unknown> | null;
  staleThresholdSeconds?: number;
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageSeconds(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 1000)) : null;
}

export function shortOperatorText(value: unknown, max = 250): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function getMonitorTruth(input: MonitorTruthInput): { level: MonitorTruthLevel; label: string; reason: string; runAgeSeconds: number | null; accountAgeSeconds: number | null } {
  const threshold = input.staleThresholdSeconds ?? 180;
  const result = input.latest_monitor_result ?? {};
  const reconciliation = (result.reconciliation_summary ?? {}) as Record<string, unknown>;
  const runAge = ageSeconds(input.latest_monitor_run_at);
  const accountAge = ageSeconds(input.latest_account_state_at);
  if (runAge === null) return { level: 'stale', label: 'STALE', reason: 'no monitor invocation recorded', runAgeSeconds: runAge, accountAgeSeconds: accountAge };
  if (runAge > threshold) return { level: 'stale', label: 'STALE', reason: `latest successful monitor run is ${runAge}s old`, runAgeSeconds: runAge, accountAgeSeconds: accountAge };
  if (accountAge === null || accountAge > threshold) return { level: 'stale', label: 'STALE', reason: accountAge === null ? 'no recent account fetch recorded' : `latest account fetch is ${accountAge}s old`, runAgeSeconds: runAge, accountAgeSeconds: accountAge };

  const status = String(result.monitor_status ?? input.latest_monitor_status ?? '').toLowerCase();
  const critical = count(result.unsafe_positions_count ?? result.unsafe_positions) > 0
    || count(result.critical_errors_count) > 0
    || count(reconciliation.unprotected_position_count) > 0
    || count(reconciliation.orphan_position_count) > 0
    || count(reconciliation.protection_failed_count) > 0
    || count(reconciliation.missing_sl_count) > 0
    || count(reconciliation.unresolved_critical_count) > 0
    || count(reconciliation.account_fetch_failed_count) > 0
    || count(reconciliation.reconciliation_failed_count) > 0
    || ['error', 'failed', 'completed_with_sync_error'].includes(status);
  if (critical) return { level: 'critical', label: 'CRITICAL', reason: shortOperatorText(input.latest_monitor_error || input.latest_sync_error || 'position missing SL, orphan position, protection failure, or account fetch failure exists'), runAgeSeconds: runAge, accountAgeSeconds: accountAge };

  const checked = count(result.checked);
  const protectedCount = count(result.protected);
  const hasCleanProtectedState = checked > 0
    && protectedCount === checked
    && count(result.unsafe_positions_count ?? result.unsafe_positions) === 0
    && count(result.warnings_count) === 0
    && count(result.critical_errors_count) === 0
    && !input.latest_monitor_error
    && !input.latest_sync_error
    && !result.latest_monitor_error
    && !result.latest_monitor_warning;
  const degradedSignals = count(result.warnings_count) > 0
    || count(reconciliation.missing_tp1_count) > 0
    || count(reconciliation.missing_tp2_count) > 0
    || count(reconciliation.recovery_pending_count) > 0
    || count(result.row_errors_count) > 0
    || count(reconciliation.protection_degraded_count) > 0
    || count(reconciliation.duplicate_conditional_count) > 0
    || count(reconciliation.stale_or_orphan_order_count) > 0
    || Boolean(input.latest_monitor_error || input.latest_sync_error);
  const degraded = degradedSignals || (status === 'degraded' && !hasCleanProtectedState);
  if (degraded) return { level: 'warning', label: 'WARNING', reason: shortOperatorText(input.latest_monitor_error || input.latest_sync_error || 'missing TP, stale monitor warning, duplicate/order cleanup, or recovery pending'), runAgeSeconds: runAge, accountAgeSeconds: accountAge };
  return { level: 'healthy', label: 'HEALTHY', reason: 'latest monitor invocation and account fetch are recent with no unsafe positions', runAgeSeconds: runAge, accountAgeSeconds: accountAge };
}
