import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ScannerRun, ProviderStatus } from '../lib/types';

export interface RuntimeProviderConfig {
  provider: string;
  fallbacks: string[];
  demo_fallback: boolean;
  finnhub_api_key_set: boolean;
  twelvedata_api_key_set: boolean;
  fetched_at: string;
  raw?: Record<string, unknown>;
}

export interface AdminLiveState {
  // Cron / scheduler
  cronDetected: boolean;
  cronReason: string;
  cronJobName: string | null;
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
  recentRuns: ScannerRun[];

  // Providers
  providers: ProviderStatus[];
  runtimeConfig: RuntimeProviderConfig | null;
  runtimeConfigError: string | null;

  // Signals
  latestApprovedRealSignalCount: number;
  latestRealCryptoSignalCount: number;
  latestRealForexSignalCount: number;
  oldDemoSignalCount: number;

  // Telegram
  telegramConfigured: boolean;
  autoSendTelegram: boolean;
  latestTelegramDelivery: { status: string; created_at: string } | null;

  // Auto Telegram
  allowDemoTelegramSending: boolean;
  minAutoSendGrade: string;

  loading: boolean;
  loadedAt: string | null;
}

const DEFAULT_STATE: AdminLiveState = {
  cronDetected: false,
  cronReason: 'Not yet loaded',
  cronJobName: null,
  scheduleEnabled: false,
  scanIntervalMinutes: 5,
  lastScheduledRunAt: null,
  lastManualRunAt: null,
  heartbeatStatus: 'inactive',
  heartbeatUpdatedAt: null,
  scannerEnabled: false,
  latestRun: null,
  latestScheduledRun: null,
  recentRuns: [],
  providers: [],
  runtimeConfig: null,
  runtimeConfigError: null,
  latestApprovedRealSignalCount: 0,
  latestRealCryptoSignalCount: 0,
  latestRealForexSignalCount: 0,
  oldDemoSignalCount: 0,
  telegramConfigured: false,
  autoSendTelegram: false,
  latestTelegramDelivery: null,
  allowDemoTelegramSending: false,
  minAutoSendGrade: 'A',
  loading: true,
  loadedAt: null,
};

export function useAdminLiveState(session: { access_token: string } | null) {
  const [state, setState] = useState<AdminLiveState>(DEFAULT_STATE);

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));

    const [
      runsRes,
      provRes,
      cfgRes,
      realSignalCountRes,
      realCryptoCountRes,
      realForexCountRes,
      demoSignalCountRes,
      tgRes,
    ] = await Promise.all([
      supabase.from('scanner_runs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('provider_status').select('*'),
      supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').in('status', ['waiting', 'active']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').eq('market_type', 'crypto').in('status', ['waiting', 'active']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).eq('data_source', 'REAL DATA').eq('market_type', 'forex').in('status', ['waiting', 'active']),
      supabase.from('signals').select('id', { count: 'exact', head: true }).neq('data_source', 'REAL DATA'),
      supabase.from('telegram_deliveries').select('status,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const runs: ScannerRun[] = (runsRes.data ?? []) as ScannerRun[];
    const cfg = cfgRes.data;
    const latestRun = runs[0] ?? null;
    const latestScheduledRun = runs.find(r => r.run_type === 'scheduled') ?? null;

    // Cron detection logic:
    // 1. DB flag cron_job_active = true (set by admin after confirming job exists)
    // 2. A recent scheduled run exists within 3× the scan interval
    // 3. heartbeat_status is healthy (implies recent scheduled run succeeded)
    const cronJobActive = cfg?.cron_job_active === true;
    const hasRecentScheduledRun = latestScheduledRun !== null;
    const heartbeatHealthy = cfg?.heartbeat_status === 'healthy';
    const scheduleEnabled = cfg?.schedule_enabled ?? false;

    let cronDetected = false;
    let cronReason = '';

    if (cronJobActive) {
      cronDetected = true;
      cronReason = `pg_cron job configured (${cfg?.cron_job_name ?? 'hashibot-scheduled-scanner'})`;
    } else if (hasRecentScheduledRun && scheduleEnabled) {
      cronDetected = true;
      const minsAgo = Math.round((Date.now() - new Date(latestScheduledRun.started_at).getTime()) / 60000);
      cronReason = `Detected via scheduled run ${minsAgo}m ago`;
    } else if (heartbeatHealthy && scheduleEnabled) {
      cronDetected = true;
      cronReason = 'Detected via healthy heartbeat';
    } else if (!scheduleEnabled) {
      cronDetected = false;
      cronReason = 'Schedule disabled in Scanner Config';
    } else {
      cronDetected = false;
      cronReason = 'No scheduled runs found — set up pg_cron job';
    }

    // Runtime provider config — fetch live from edge function
    let runtimeConfig: RuntimeProviderConfig | null = null;
    let runtimeConfigError: string | null = null;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/market-scanner`, {
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
        };
      } else {
        runtimeConfigError = json?.error ? String(json.error) : 'Could not fetch runtime config';
      }
    } catch (e) {
      runtimeConfigError = e instanceof Error ? e.message : 'Network error fetching runtime config';
    }

    setState({
      cronDetected,
      cronReason,
      cronJobName: cfg?.cron_job_name ?? null,
      scheduleEnabled,
      scanIntervalMinutes: cfg?.scan_interval_minutes ?? 5,
      lastScheduledRunAt: cfg?.last_scheduled_scan_at ?? null,
      lastManualRunAt: cfg?.last_manual_scan_at ?? null,
      heartbeatStatus: cfg?.heartbeat_status ?? 'inactive',
      heartbeatUpdatedAt: cfg?.heartbeat_updated_at ?? null,
      scannerEnabled: cfg?.is_enabled ?? false,
      latestRun,
      latestScheduledRun,
      recentRuns: runs,
      providers: (provRes.data ?? []) as ProviderStatus[],
      runtimeConfig,
      runtimeConfigError,
      latestApprovedRealSignalCount: realSignalCountRes.count ?? 0,
      latestRealCryptoSignalCount: realCryptoCountRes.count ?? 0,
      latestRealForexSignalCount: realForexCountRes.count ?? 0,
      oldDemoSignalCount: demoSignalCountRes.count ?? 0,
      telegramConfigured: Boolean(runtimeConfig?.finnhub_api_key_set !== undefined),
      autoSendTelegram: cfg?.auto_send_telegram ?? false,
      latestTelegramDelivery: tgRes.data ?? null,
      allowDemoTelegramSending: cfg?.allow_demo_telegram_sending ?? false,
      minAutoSendGrade: cfg?.min_auto_send_grade ?? 'A',
      loading: false,
      loadedAt: new Date().toISOString(),
    });
  }, [session]);

  return { state, refresh };
}
