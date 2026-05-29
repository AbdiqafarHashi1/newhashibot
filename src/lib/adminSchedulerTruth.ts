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

export const SCANNER_RUN_PROOF_COLUMNS = 'id,run_type,status,started_at,finished_at,symbols_scanned,signals_created,telegram_sent_count,error_message';

export const LATEST_SCHEDULED_PROOF_SQL = `select
  id,
  run_type,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  error_message
from scanner_runs
where lower(run_type) = 'scheduled'
order by started_at desc
limit 1;`;

export const RECENT_SCHEDULED_PROOF_SQL = `select
  id,
  run_type,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  error_message
from scanner_runs
where lower(run_type) = 'scheduled'
order by started_at desc
limit 20;`;

export const LATEST_MANUAL_PROOF_SQL = `select
  id,
  run_type,
  status,
  started_at,
  finished_at,
  symbols_scanned,
  signals_created,
  telegram_sent_count,
  error_message
from scanner_runs
where lower(run_type) = 'manual'
order by started_at desc
limit 1;`;

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
