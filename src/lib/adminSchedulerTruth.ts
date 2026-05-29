import { ScannerRun } from './types';

export type SchedulerProofStatus = 'active' | 'recent' | 'stale' | 'missing';
export type SchedulerProofLabel = 'Proven / Active' | 'Recently proven' | 'Stale' | 'Not configured' | 'Missing';

export interface SchedulerProof {
  status: SchedulerProofStatus;
  label: SchedulerProofLabel;
  ageMinutes: number | null;
  reason: string;
  latestRunId: string | null;
  latestStartedAt: string | null;
  refreshedAt: string;
}

export const SCHEDULED_ACTIVE_MINUTES = 7;
export const SCHEDULED_RECENT_MINUTES = 15;

export const SCANNER_RUN_PROOF_COLUMNS = 'id,run_type,source,triggered_by,is_automatic,status,started_at,finished_at,symbols_scanned,signals_created,telegram_sent_count,telegram_failed_count,error_message,outcome_checked,outcomes_updated,outcome_telegram_sent,outcome_telegram_failed,outcome_error';

export const LATEST_SCHEDULED_PROOF_SQL = `select
  id,
  run_type,
  source,
  triggered_by,
  is_automatic,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  telegram_failed_count,
  error_message,
  outcome_checked,
  outcomes_updated,
  outcome_telegram_sent,
  outcome_telegram_failed,
  outcome_error
from scanner_runs
where lower(run_type) = 'scheduled'
  and (
    source = 'pg_cron'
    or triggered_by = 'pg_cron'
    or is_automatic = true
  )
order by started_at desc
limit 1;`;

export const RECENT_SCHEDULED_PROOF_SQL = `select
  id,
  run_type,
  source,
  triggered_by,
  is_automatic,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  telegram_failed_count,
  error_message,
  outcome_checked,
  outcomes_updated,
  outcome_telegram_sent,
  outcome_telegram_failed,
  outcome_error
from scanner_runs
where lower(run_type) = 'scheduled'
  and (
    source = 'pg_cron'
    or triggered_by = 'pg_cron'
    or is_automatic = true
  )
order by started_at desc
limit 20;`;

export const LATEST_MANUAL_PROOF_SQL = `select
  id,
  run_type,
  source,
  triggered_by,
  is_automatic,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  telegram_failed_count,
  error_message,
  outcome_checked,
  outcomes_updated,
  outcome_telegram_sent,
  outcome_telegram_failed,
  outcome_error
from scanner_runs
where triggered_by = 'manual_button'
   or source like '%manual%'
   or lower(run_type) = 'manual'
order by started_at desc
limit 1;`;


export const AUTOMATIC_SCHEDULER_PROOF_OR = 'source.eq.pg_cron,triggered_by.eq.pg_cron,is_automatic.eq.true';
export const MANUAL_PROOF_OR = 'triggered_by.eq.manual_button,source.ilike.%manual%,run_type.ilike.manual';
export const AUTOMATIC_OUTCOME_PROOF_OR = 'source.eq.scheduled_market_scanner,triggered_by.eq.pg_cron,is_automatic.eq.true';
export const MANUAL_OUTCOME_PROOF_OR = 'source.eq.manual_outcome_button,triggered_by.eq.manual_button,message.ilike.%source: manual_button%';

export function isAutomaticSchedulerRun(run: Pick<ScannerRun, 'run_type' | 'source' | 'triggered_by' | 'is_automatic'> | null | undefined): boolean {
  if (!run || String(run.run_type ?? '').toLowerCase() !== 'scheduled') return false;
  return run.source === 'pg_cron' || run.triggered_by === 'pg_cron' || run.is_automatic === true;
}

export function isManualRunProof(run: Pick<ScannerRun, 'run_type' | 'source' | 'triggered_by' | 'is_automatic'> | null | undefined): boolean {
  if (!run) return false;
  return run.triggered_by === 'manual_button' || String(run.source ?? '').includes('manual') || String(run.run_type ?? '').toLowerCase() === 'manual';
}

export function ageMinutesFromStartedAt(startedAt?: string | null): number | null {
  if (!startedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  return Math.max(0, Math.round((Date.now() - startedMs) / 60000));
}

export function buildSchedulerProof(latestScheduledRun: Pick<ScannerRun, 'id' | 'started_at' | 'signals_created'> | null, configured = true): SchedulerProof {
  const ageMinutes = ageMinutesFromStartedAt(latestScheduledRun?.started_at ?? null);
  const refreshedAt = new Date().toISOString();

  if (!latestScheduledRun || ageMinutes === null) {
    const label: SchedulerProofLabel = configured ? 'Missing' : 'Not configured';
    return {
      status: 'missing',
      label,
      ageMinutes: null,
      reason: configured
        ? "No scanner_runs row found where lower(run_type) = 'scheduled'. scanner_config flags, Edge probes, net_http_response, and cron.job_run_details are diagnostics only."
        : "No scheduled scanner_runs proof yet. scanner_config.cron_job_active is configuration only, not proof.",
      latestRunId: null,
      latestStartedAt: null,
      refreshedAt,
    };
  }

  const signalCount = latestScheduledRun.signals_created ?? 0;
  const signalText = signalCount === 0
    ? '0 signals still counts as scheduler proof'
    : `${signalCount} signal${signalCount === 1 ? '' : 's'} created`;

  if (ageMinutes <= SCHEDULED_ACTIVE_MINUTES) {
    return {
      status: 'active',
      label: 'Proven / Active',
      ageMinutes,
      reason: `Latest scheduled scanner_run started ${ageMinutes}m ago; ${signalText}. Telegram sends and outcome rows are not required for cron proof.`,
      latestRunId: latestScheduledRun.id,
      latestStartedAt: latestScheduledRun.started_at,
      refreshedAt,
    };
  }

  if (ageMinutes <= SCHEDULED_RECENT_MINUTES) {
    return {
      status: 'recent',
      label: 'Recently proven',
      ageMinutes,
      reason: `Latest scheduled scanner_run started ${ageMinutes}m ago; recently proven; ${signalText}. Telegram sends and outcome rows are not required for cron proof.`,
      latestRunId: latestScheduledRun.id,
      latestStartedAt: latestScheduledRun.started_at,
      refreshedAt,
    };
  }

  return {
    status: 'stale',
    label: 'Stale',
    ageMinutes,
    reason: `Latest scheduled scanner_run started ${ageMinutes}m ago, older than ${SCHEDULED_RECENT_MINUTES}m; ${signalText}.`,
    latestRunId: latestScheduledRun.id,
    latestStartedAt: latestScheduledRun.started_at,
    refreshedAt,
  };
}

export function scheduledFreshnessLabel(latestScheduledRun: Pick<ScannerRun, 'id' | 'started_at' | 'signals_created'> | null): SchedulerProofLabel {
  return buildSchedulerProof(latestScheduledRun).label;
}

export function isScheduledProofActive(latestScheduledRun: Pick<ScannerRun, 'id' | 'started_at' | 'signals_created'> | null): boolean {
  return buildSchedulerProof(latestScheduledRun).status === 'active';
}

export function isScheduledProofRecent(latestScheduledRun: Pick<ScannerRun, 'id' | 'started_at' | 'signals_created'> | null): boolean {
  const status = buildSchedulerProof(latestScheduledRun).status;
  return status === 'active' || status === 'recent';
}

export function schedulerProofReason(latestScheduledRun: ScannerRun | null): string {
  return buildSchedulerProof(latestScheduledRun).reason;
}
