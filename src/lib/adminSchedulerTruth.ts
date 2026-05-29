import { ScannerRun } from './types';

export type SchedulerFreshnessStatus = 'Proven / Active' | 'Recently proven' | 'Stale' | 'Configured, not proven';

export const SCHEDULED_ACTIVE_MINUTES = 7;
export const SCHEDULED_RECENT_MINUTES = 15;

export const LATEST_SCHEDULED_PROOF_SQL = `select id, run_type, status, started_at, finished_at, symbols_scanned, signals_created, telegram_sent_count
from scanner_runs
where lower(run_type) = 'scheduled'
order by started_at desc
limit 1;`;

export function ageMinutesFromStartedAt(startedAt?: string | null): number | null {
  if (!startedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  return Math.max(0, Math.round((Date.now() - startedMs) / 60000));
}

export function scheduledFreshnessLabel(latestScheduledRun: Pick<ScannerRun, 'started_at'> | null): SchedulerFreshnessStatus {
  const ageMinutes = ageMinutesFromStartedAt(latestScheduledRun?.started_at ?? null);
  if (ageMinutes === null) return 'Configured, not proven';
  if (ageMinutes <= SCHEDULED_ACTIVE_MINUTES) return 'Proven / Active';
  if (ageMinutes <= SCHEDULED_RECENT_MINUTES) return 'Recently proven';
  return 'Stale';
}

export function isScheduledProofActive(latestScheduledRun: Pick<ScannerRun, 'started_at'> | null): boolean {
  return scheduledFreshnessLabel(latestScheduledRun) === 'Proven / Active';
}

export function isScheduledProofRecent(latestScheduledRun: Pick<ScannerRun, 'started_at'> | null): boolean {
  const label = scheduledFreshnessLabel(latestScheduledRun);
  return label === 'Proven / Active' || label === 'Recently proven';
}

export function schedulerProofReason(latestScheduledRun: ScannerRun | null): string {
  const ageMinutes = ageMinutesFromStartedAt(latestScheduledRun?.started_at ?? null);
  if (!latestScheduledRun || ageMinutes === null) {
    return 'No scanner_runs row found where lower(run_type) = scheduled. Cron SQL diagnostics are secondary only.';
  }

  const signalCount = latestScheduledRun.signals_created ?? 0;
  const signalText = signalCount === 0
    ? '0 signals still counts as scheduler proof'
    : `${signalCount} signal${signalCount === 1 ? '' : 's'} created`;

  if (ageMinutes <= SCHEDULED_ACTIVE_MINUTES) {
    return `Latest scheduled scanner_run started ${ageMinutes}m ago; ${signalText}.`;
  }
  if (ageMinutes <= SCHEDULED_RECENT_MINUTES) {
    return `Latest scheduled scanner_run started ${ageMinutes}m ago; recently proven; ${signalText}.`;
  }
  return `Latest scheduled scanner_run started ${ageMinutes}m ago, older than ${SCHEDULED_RECENT_MINUTES}m; ${signalText}.`;
}
