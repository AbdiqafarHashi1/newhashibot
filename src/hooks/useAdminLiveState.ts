import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ScannerRun, ProviderStatus } from '../lib/types';
import { callEdgeFunction, EdgeFunctionReachability } from '../lib/edgeFunctionStatus';
import { SchedulerProof, buildSchedulerProof, SCANNER_RUN_PROOF_COLUMNS, AUTOMATIC_SCHEDULER_PROOF_OR, MANUAL_PROOF_OR, AUTOMATIC_OUTCOME_PROOF_OR, MANUAL_OUTCOME_PROOF_OR } from '../lib/adminSchedulerTruth';
import { edgeFunctionUrl, frontendSupabaseDebugInfo, FrontendSupabaseDebugInfo } from '../lib/supabaseEnv';

export interface RuntimeProviderConfig {
  provider: string;
  fallbacks: string[];
  demo_fallback: boolean;
  finnhub_api_key_set: boolean;
  twelvedata_api_key_set: boolean;
  fetched_at: string;
  raw?: Record<string, unknown>;
  crypto_provider?: string;
  market_mode?: string;
  signal_enable_crypto?: boolean;
  signal_enable_forex?: boolean;
  forex_disabled_for_mvp?: boolean;
  telegram_enabled?: boolean;
  enable_signal_mode_output?: boolean;
  telegram_bot_token_set?: boolean;
  telegram_default_channel_id_set?: boolean;
  telegram_chat_id_set?: boolean;
  supabase_url_set?: boolean;
  supabase_service_role_key_set?: boolean;
  scanner_cron_secret_set?: boolean;
}

export interface AdminLiveState {
  // Cron / scheduler
  cronDetected: boolean; // Backward-compatible alias for cronProven
  cronConfigured: boolean;
  cronProven: boolean;
  cronStale: boolean;
  cronStatusLabel: string;
  cronReason: string;
  schedulerProof: SchedulerProof;
  cronJobName: string | null;
  adminSchedulerActionStatus: EdgeFunctionReachability;
  adminSchedulerActionMessage: string | null;
  outcomeTrackingStatus: string;
  lastScheduledRunAgeMinutes: number | null;
  scheduleEnabled: boolean;
  scanIntervalMinutes: number;
  lastScheduledRunAt: string | null;
  lastManualRunAt: string | null;
  heartbeatStatus: string;
  heartbeatUpdatedAt: string | null;

  // Scanner
  scannerEnabled: boolean;
  latestRun: ScannerRun | null;
  latestScheduledRun: ScannerRun | null;
  latestManualRun: ScannerRun | null;
  recentRuns: ScannerRun[];
  recentScheduledRuns: ScannerRun[];
  recentManualRuns: ScannerRun[];
  latestAutomaticOutcomeCheckAt: string | null;
  latestManualOutcomeCheckAt: string | null;

  // Providers
  providers: ProviderStatus[];
  runtimeConfig: RuntimeProviderConfig | null;
  runtimeConfigError: string | null;

  // Signals
  latestApprovedRealSignalCount: number;
  latestRealCryptoSignalCount: number;
  latestRealForexSignalCount: number;
  oldDemoSignalCount: number;
  marketMode: string;
  signalEnableCrypto: boolean;
  signalEnableForex: boolean;

  // Telegram
  telegramConfigured: boolean;
  autoSendTelegram: boolean;
  latestTelegramDelivery: { status: string; created_at: string; error_message?: string; delivery_type?: string } | null;
  latestOutcomeDelivery: { status: string; created_at: string; error_message?: string; delivery_type?: string } | null;
  latestSignalUpdate: { signal_id: string; new_status: string; created_at: string; reason?: string | null; message?: string | null } | null;
  latestAutomaticOutcomeUpdate: { signal_id: string; new_status: string; created_at: string; reason?: string | null; message?: string | null } | null;
  latestManualOutcomeUpdate: { signal_id: string; new_status: string; created_at: string; reason?: string | null; message?: string | null } | null;

  // Auto Telegram
  allowDemoTelegramSending: boolean;
  minAutoSendGrade: string;

  loading: boolean;
  loadedAt: string | null;
  frontendSupabase: FrontendSupabaseDebugInfo;
  latestScheduledQuerySource: 'live' | 'query_failed';
  latestScheduledQueryError: string | null;
}

const DEFAULT_STATE: AdminLiveState = {
  cronDetected: false,
  cronConfigured: false,
  cronProven: false,
  cronStale: false,
  cronStatusLabel: 'Not loaded',
  cronReason: 'Not yet loaded',
  schedulerProof: buildSchedulerProof(null),
  cronJobName: null,
  adminSchedulerActionStatus: 'unknown',
  adminSchedulerActionMessage: null,
  outcomeTrackingStatus: 'Not verified',
  lastScheduledRunAgeMinutes: null,
  scheduleEnabled: false,
  scanIntervalMinutes: 5,
  lastScheduledRunAt: null,
  lastManualRunAt: null,
  heartbeatStatus: 'inactive',
  heartbeatUpdatedAt: null,
  scannerEnabled: false,
  latestRun: null,
  latestScheduledRun: null,
  latestManualRun: null,
  recentRuns: [],
  recentScheduledRuns: [],
  recentManualRuns: [],
  latestAutomaticOutcomeCheckAt: null,
  latestManualOutcomeCheckAt: null,
  providers: [],
  runtimeConfig: null,
  runtimeConfigError: null,
  latestApprovedRealSignalCount: 0,
  latestRealCryptoSignalCount: 0,
  latestRealForexSignalCount: 0,
  oldDemoSignalCount: 0,
  marketMode: 'crypto_only',
  signalEnableCrypto: true,
  signalEnableForex: false,
  telegramConfigured: false,
  autoSendTelegram: false,
  latestTelegramDelivery: null,
  latestOutcomeDelivery: null,
  latestSignalUpdate: null,
  latestAutomaticOutcomeUpdate: null,
  latestManualOutcomeUpdate: null,
  allowDemoTelegramSending: false,
  minAutoSendGrade: 'A',
  loading: true,
  loadedAt: null,
  frontendSupabase: frontendSupabaseDebugInfo,
  latestScheduledQuerySource: 'live',
  latestScheduledQueryError: null,
};

export function useAdminLiveState(session: { access_token: string } | null) {
  const [state, setState] = useState<AdminLiveState>(DEFAULT_STATE);
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = refreshSeq.current + 1;
    refreshSeq.current = seq;
    setState(prev => ({ ...prev, loading: true }));

    const [
      runsRes,
      latestScheduledRunRes,
      recentScheduledRunsRes,
      latestManualRunRes,
      recentManualRunsRes,
      latestAutomaticOutcomeRunRes,
      latestManualOutcomeRunRes,
      provRes,
      cfgRes,
      realSignalCountRes,
      realCryptoCountRes,
      realForexCountRes,
      demoSignalCountRes,
      tgRes,
      outcomeTgRes,
      updateRes,
      autoUpdateRes,
      manualUpdateRes,
    ] = await Promise.all([
      supabase.from('scanner_runs').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).ilike('run_type', 'scheduled').or(AUTOMATIC_SCHEDULER_PROOF_OR).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).ilike('run_type', 'scheduled').or(AUTOMATIC_SCHEDULER_PROOF_OR).order('started_at', { ascending: false }).limit(20),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).or(MANUAL_PROOF_OR).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).or(MANUAL_PROOF_OR).order('started_at', { ascending: false }).limit(20),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).ilike('run_type', 'scheduled').or(AUTOMATIC_SCHEDULER_PROOF_OR).eq('outcome_checked', true).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scanner_runs').select(SCANNER_RUN_PROOF_COLUMNS).or(MANUAL_PROOF_OR).eq('outcome_checked', true).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('provider_status').select('*'),
      supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').eq('market_type', 'crypto').in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').eq('market_type', 'forex').in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).neq('data_source', 'REAL DATA'),
      supabase.from('telegram_deliveries').select('status,created_at,error_message,delivery_type').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('telegram_deliveries').select('status,created_at,error_message,delivery_type').like('delivery_type', 'outcome_%').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('signal_updates').select('signal_id,new_status,created_at,reason,message').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('signal_updates').select('signal_id,new_status,created_at,reason,message,source,triggered_by,is_automatic').or(AUTOMATIC_OUTCOME_PROOF_OR).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('signal_updates').select('signal_id,new_status,created_at,reason,message,source,triggered_by,is_automatic').or(MANUAL_OUTCOME_PROOF_OR).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const runs: ScannerRun[] = (runsRes.data ?? []) as ScannerRun[];
    const recentScheduledRuns: ScannerRun[] = (recentScheduledRunsRes.data ?? []) as ScannerRun[];
    const recentManualRuns: ScannerRun[] = (recentManualRunsRes.data ?? []) as ScannerRun[];
    const cfg = cfgRes.data;
    const latestRun = runs[0] ?? null;
    const latestScheduledQueryError = latestScheduledRunRes.error?.message ?? recentScheduledRunsRes.error?.message ?? recentManualRunsRes.error?.message ?? latestAutomaticOutcomeRunRes.error?.message ?? latestManualOutcomeRunRes.error?.message ?? null;
    const latestScheduledRun = (latestScheduledRunRes.data as ScannerRun | null) ?? null;
    const latestManualRun = (latestManualRunRes.data as ScannerRun | null) ?? null;

    const cronConfigured = cfg?.cron_job_active === true;
    const scheduleEnabled = cfg?.schedule_enabled ?? false;
    const scanIntervalMinutes = cfg?.scan_interval_minutes ?? 5;
    const schedulerProof = buildSchedulerProof(latestScheduledRun, cfg?.cron_job_active === true || cfg?.schedule_enabled === true);
    const lastScheduledRunAgeMinutes = schedulerProof.ageMinutes;
    const cronStatusLabel = schedulerProof.label;
    const cronReason = schedulerProof.reason;
    const cronProven = schedulerProof.status === 'active' || schedulerProof.status === 'recent';
    const cronStale = schedulerProof.status === 'stale';
    const cronDetected = cronProven;

    // Runtime provider config — fetch live from edge function
    let runtimeConfig: RuntimeProviderConfig | null = null;
    let runtimeConfigError: string | null = null;
    try {
      const res = await fetch(edgeFunctionUrl('market-scanner'), {
        method: 'POST',
        headers: {
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
        body: JSON.stringify({ debug_provider_config: true }),
      });
      const json = await res.json() as Record<string, unknown>;
      if (json?.success) {
        runtimeConfig = {
          provider: String(json.provider ?? 'unknown'),
          fallbacks: Array.isArray(json.fallbacks) ? (json.fallbacks as string[]) : [],
          demo_fallback: Boolean(json.demo_fallback),
          finnhub_api_key_set: Boolean(json.finnhub_api_key_set),
          twelvedata_api_key_set: Boolean(json.twelvedata_api_key_set),
          fetched_at: new Date().toISOString(),
          raw: json,
          crypto_provider: String(json.crypto_provider ?? 'binance'),
          market_mode: String(json.market_mode ?? 'crypto_only'),
          signal_enable_crypto: Boolean(json.signal_enable_crypto ?? true),
          signal_enable_forex: Boolean(json.signal_enable_forex ?? false),
          forex_disabled_for_mvp: Boolean(json.forex_disabled_for_mvp ?? json.signal_enable_forex === false),
          telegram_enabled: Boolean(json.telegram_enabled),
          enable_signal_mode_output: Boolean(json.enable_signal_mode_output),
          telegram_bot_token_set: Boolean(json.telegram_bot_token_set),
          telegram_default_channel_id_set: Boolean(json.telegram_default_channel_id_set),
          telegram_chat_id_set: Boolean(json.telegram_chat_id_set),
          supabase_url_set: Boolean(json.supabase_url_set),
          supabase_service_role_key_set: Boolean(json.supabase_service_role_key_set),
          scanner_cron_secret_set: Boolean(json.scanner_cron_secret_set),
        };
      } else {
        runtimeConfigError = json?.error ? String(json.error) : 'Could not fetch runtime config';
      }
    } catch (e) {
      runtimeConfigError = e instanceof Error ? e.message : 'Network error fetching runtime config';
    }

    let adminSchedulerActionStatus: EdgeFunctionReachability = 'unknown';
    let adminSchedulerActionMessage: string | null = null;
    if (session?.access_token) {
      try {
        const adminStatus = await callEdgeFunction('admin-scheduler-action', { action: 'status' }, session.access_token);
        adminSchedulerActionStatus = adminStatus.reachability;
        adminSchedulerActionMessage = adminStatus.message;
      } catch (e) {
        adminSchedulerActionStatus = 'unreachable';
        adminSchedulerActionMessage = e instanceof Error ? e.message : 'admin-scheduler-action status check failed';
      }
    }

    const latestAutomaticOutcomeCheckAt = latestAutomaticOutcomeRunRes.data?.started_at ?? autoUpdateRes.data?.created_at ?? null;
    const latestManualOutcomeCheckAt = latestManualOutcomeRunRes.data?.started_at ?? manualUpdateRes.data?.created_at ?? null;
    const autoOutcomeAgeMinutes = latestAutomaticOutcomeCheckAt ? Math.round((Date.now() - new Date(latestAutomaticOutcomeCheckAt).getTime()) / 60000) : null;
    const manualOutcomeAgeMinutes = latestManualOutcomeCheckAt ? Math.round((Date.now() - new Date(latestManualOutcomeCheckAt).getTime()) / 60000) : null;
    const outcomeTrackingStatus = autoOutcomeAgeMinutes !== null && autoOutcomeAgeMinutes <= Math.max(15, scanIntervalMinutes * 3)
      ? 'Automatic outcome active'
      : manualOutcomeAgeMinutes !== null && manualOutcomeAgeMinutes <= Math.max(15, scanIntervalMinutes * 3)
        ? 'Manual outcome active'
        : latestAutomaticOutcomeCheckAt
          ? 'Automatic outcome stale'
          : latestManualOutcomeCheckAt || outcomeTgRes.data || updateRes.data
            ? 'Manual proof only'
            : 'Not verified';

    const effectiveSignalEnableCrypto = (runtimeConfig?.signal_enable_crypto ?? true) && cfg?.scan_crypto_enabled !== false;
    const effectiveSignalEnableForex = (runtimeConfig?.signal_enable_forex ?? false) && cfg?.scan_forex_enabled === true;
    const effectiveMarketMode = effectiveSignalEnableCrypto && !effectiveSignalEnableForex
      ? 'crypto_only'
      : effectiveSignalEnableCrypto && effectiveSignalEnableForex
        ? 'crypto_and_forex'
        : !effectiveSignalEnableCrypto && effectiveSignalEnableForex
          ? 'forex_only'
          : 'disabled';

    if (seq !== refreshSeq.current) return;

    setState({
      cronDetected,
      cronConfigured,
      cronProven,
      cronStale,
      cronStatusLabel,
      cronReason,
      schedulerProof,
      cronJobName: cfg?.cron_job_name ?? null,
      adminSchedulerActionStatus,
      adminSchedulerActionMessage,
      outcomeTrackingStatus,
      lastScheduledRunAgeMinutes,
      scheduleEnabled,
      scanIntervalMinutes,
      lastScheduledRunAt: latestScheduledRun?.started_at ?? cfg?.last_scheduled_scan_at ?? null,
      lastManualRunAt: latestManualRun?.started_at ?? cfg?.last_manual_scan_at ?? null,
      heartbeatStatus: schedulerProof.status === 'active' ? 'healthy' : schedulerProof.status,
      heartbeatUpdatedAt: schedulerProof.latestStartedAt ?? cfg?.heartbeat_updated_at ?? null,
      scannerEnabled: cfg?.is_enabled ?? false,
      latestRun,
      latestScheduledRun,
      latestManualRun,
      recentRuns: runs,
      recentScheduledRuns,
      recentManualRuns,
      latestAutomaticOutcomeCheckAt,
      latestManualOutcomeCheckAt,
      providers: (provRes.data ?? []) as ProviderStatus[],
      runtimeConfig,
      runtimeConfigError,
      latestApprovedRealSignalCount: realSignalCountRes.count ?? 0,
      latestRealCryptoSignalCount: realCryptoCountRes.count ?? 0,
      latestRealForexSignalCount: realForexCountRes.count ?? 0,
      oldDemoSignalCount: demoSignalCountRes.count ?? 0,
      marketMode: effectiveMarketMode,
      signalEnableCrypto: effectiveSignalEnableCrypto,
      signalEnableForex: effectiveSignalEnableForex,
      telegramConfigured: Boolean(runtimeConfig?.finnhub_api_key_set !== undefined),
      autoSendTelegram: cfg?.auto_send_telegram ?? false,
      latestTelegramDelivery: tgRes.data ?? null,
      latestOutcomeDelivery: outcomeTgRes.data ?? null,
      latestSignalUpdate: updateRes.data ?? null,
      latestAutomaticOutcomeUpdate: autoUpdateRes.data ?? null,
      latestManualOutcomeUpdate: manualUpdateRes.data ?? null,
      allowDemoTelegramSending: cfg?.allow_demo_telegram_sending ?? false,
      minAutoSendGrade: cfg?.min_auto_send_grade ?? 'A',
      loading: false,
      loadedAt: new Date().toISOString(),
      frontendSupabase: frontendSupabaseDebugInfo,
      latestScheduledQuerySource: latestScheduledQueryError ? 'query_failed' : 'live',
      latestScheduledQueryError,
    });
  }, [session?.access_token]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, 45_000);
    return () => {
      refreshSeq.current += 1;
      window.clearInterval(id);
    };
  }, [refresh]);

  return { state, refresh };
}
