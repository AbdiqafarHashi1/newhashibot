import { useEffect } from 'react';
import { AdminLiveState } from '../../hooks/useAdminLiveState';

const DEBUG_BUILD_MARKER = 'DEBUG_BUILD_MARKER: scheduler-proof-ui-v3';

function value(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function DebugRow({ label, children }: { label: string; children: unknown }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800/70 py-1.5 last:border-b-0">
      <span className="text-zinc-500">{label}</span>
      <span className="max-w-[60%] break-words text-right font-mono text-zinc-200">{value(children)}</span>
    </div>
  );
}

export function SchedulerProofDebug({ state }: { state: AdminLiveState }) {
  const { frontendSupabaseDebugInfo } = state;
  const latestAutomatic = state.latestAutomaticScheduledRun;
  const latestRaw = state.latestRawScheduledRun;
  const latestManual = state.latestManualRun;
  const expectedProjectRef = frontendSupabaseDebugInfo.expectedProjectRef;
  const actualProjectRef = frontendSupabaseDebugInfo.actualProjectRef;
  const projectRefMatches = frontendSupabaseDebugInfo.projectRefMatches;
  const latestAutomaticScheduledRunId = latestAutomatic?.id ?? null;
  const latestAutomaticScheduledStartedAt = latestAutomatic?.started_at ?? null;
  const latestAutomaticScheduledAge = state.schedulerProofAgeMinutes;
  const latestAutomaticSource = latestAutomatic?.source ?? null;
  const latestAutomaticTriggeredBy = latestAutomatic?.triggered_by ?? null;
  const latestAutomaticIsAutomatic = latestAutomatic?.is_automatic ?? null;
  const latestRawScheduledRunId = latestRaw?.id ?? null;
  const latestRawScheduledStartedAt = latestRaw?.started_at ?? null;
  const refreshTimestamp = state.lastRefreshAt ?? state.loadedAt;
  const queryError = state.schedulerQueryError;

  useEffect(() => {
    console.info('[HashiBot Scheduler Proof Debug v3]', {
      selectedFrontendEnvSource: frontendSupabaseDebugInfo.selectedFrontendEnvSource,
      selectedFrontendKeySource: frontendSupabaseDebugInfo.selectedFrontendKeySource,
      frontendSupabaseUrlHost: frontendSupabaseDebugInfo.frontendSupabaseUrlHost,
      expectedProjectRef,
      actualProjectRef,
      projectRefMatches,
      managedSupabaseFallbackIgnored: frontendSupabaseDebugInfo.managedSupabaseFallbackIgnored,
      frontendEnvError: frontendSupabaseDebugInfo.frontendEnvError,
      querySource: state.schedulerQuerySource,
      latestAutomaticScheduledRunId,
      latestAutomaticScheduledStartedAt,
      latestAutomaticScheduledAge,
      latestAutomaticSource,
      latestAutomaticTriggeredBy,
      latestAutomaticIsAutomatic,
      latestRawScheduledRunId,
      latestRawScheduledStartedAt,
      refreshTimestamp,
      queryError,
    });
  }, [
    frontendSupabaseDebugInfo.selectedFrontendEnvSource,
    frontendSupabaseDebugInfo.selectedFrontendKeySource,
    frontendSupabaseDebugInfo.frontendSupabaseUrlHost,
    expectedProjectRef,
    actualProjectRef,
    projectRefMatches,
    frontendSupabaseDebugInfo.managedSupabaseFallbackIgnored,
    frontendSupabaseDebugInfo.frontendEnvError,
    state.schedulerQuerySource,
    latestAutomaticScheduledRunId,
    latestAutomaticScheduledStartedAt,
    latestAutomaticScheduledAge,
    latestAutomaticSource,
    latestAutomaticTriggeredBy,
    latestAutomaticIsAutomatic,
    latestRawScheduledRunId,
    latestRawScheduledStartedAt,
    refreshTimestamp,
    queryError,
  ]);

  return (
    <section className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-zinc-300">
      <div className="mb-1 text-sm font-bold text-blue-200">ADMIN DEBUG — SCHEDULER PROOF</div>
      <div className="mb-4 font-mono text-blue-300">{DEBUG_BUILD_MARKER}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="mb-2 font-semibold text-zinc-100">Frontend / Project</div>
          <DebugRow label="selected frontend env source">{frontendSupabaseDebugInfo.selectedFrontendEnvSource}</DebugRow>
          <DebugRow label="selected frontend key source">{frontendSupabaseDebugInfo.selectedFrontendKeySource}</DebugRow>
          <DebugRow label="selected frontend Supabase URL host">{frontendSupabaseDebugInfo.frontendSupabaseUrlHost}</DebugRow>
          <DebugRow label="expected project ref">{expectedProjectRef}</DebugRow>
          <DebugRow label="actual project ref">{actualProjectRef}</DebugRow>
          <DebugRow label="project ref match">{projectRefMatches}</DebugRow>
          <DebugRow label="managed SUPABASE_* fallback ignored">{frontendSupabaseDebugInfo.managedSupabaseFallbackIgnored}</DebugRow>
          <DebugRow label="frontend env error">{frontendSupabaseDebugInfo.frontendEnvError}</DebugRow>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="mb-2 font-semibold text-zinc-100">Automatic scheduler proof</div>
          <DebugRow label="latest automatic scheduled run id">{latestAutomaticScheduledRunId}</DebugRow>
          <DebugRow label="latest automatic scheduled started_at">{latestAutomaticScheduledStartedAt}</DebugRow>
          <DebugRow label="latest automatic scheduled age">{latestAutomaticScheduledAge === null ? null : `${latestAutomaticScheduledAge}m`}</DebugRow>
          <DebugRow label="source">{latestAutomaticSource}</DebugRow>
          <DebugRow label="triggered_by">{latestAutomaticTriggeredBy}</DebugRow>
          <DebugRow label="is_automatic">{latestAutomaticIsAutomatic}</DebugRow>
          <DebugRow label="status">{latestAutomatic?.status ?? null}</DebugRow>
          <DebugRow label="symbols_scanned">{latestAutomatic?.symbols_scanned ?? null}</DebugRow>
          <DebugRow label="signals_created">{latestAutomatic?.signals_created ?? null}</DebugRow>
          <DebugRow label="query error if any">{queryError}</DebugRow>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="mb-2 font-semibold text-zinc-100">Raw scheduled latest</div>
          <DebugRow label="latest raw scheduled run id">{latestRawScheduledRunId}</DebugRow>
          <DebugRow label="latest raw scheduled started_at">{latestRawScheduledStartedAt}</DebugRow>
          <DebugRow label="latest raw source">{latestRaw?.source ?? null}</DebugRow>
          <DebugRow label="latest raw triggered_by">{latestRaw?.triggered_by ?? null}</DebugRow>
          <DebugRow label="latest raw is_automatic">{latestRaw?.is_automatic ?? null}</DebugRow>
          <DebugRow label="latest raw status">{latestRaw?.status ?? null}</DebugRow>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="mb-2 font-semibold text-zinc-100">Manual proof</div>
            <DebugRow label="latest manual run id">{latestManual?.id ?? null}</DebugRow>
            <DebugRow label="latest manual started_at">{latestManual?.started_at ?? null}</DebugRow>
            <DebugRow label="latest manual source">{latestManual?.source ?? null}</DebugRow>
            <DebugRow label="latest manual triggered_by">{latestManual?.triggered_by ?? null}</DebugRow>
            <DebugRow label="latest manual is_automatic">{latestManual?.is_automatic ?? null}</DebugRow>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="mb-2 font-semibold text-zinc-100">Runtime</div>
            <DebugRow label="refresh timestamp">{refreshTimestamp}</DebugRow>
            <DebugRow label="query source">{state.schedulerQuerySource}</DebugRow>
            <DebugRow label="polling enabled">{state.pollingEnabled}</DebugRow>
          </div>
        </div>
      </div>
    </section>
  );
}
