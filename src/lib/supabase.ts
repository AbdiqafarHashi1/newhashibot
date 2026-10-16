import { isOwnerPreview } from './ownerPreview/state.js';
import { previewClient } from './ownerPreview/adapter.js';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { createClient } from '@supabase/supabase-js';
import { EXPECTED_SUPABASE_ORIGIN, getSupabaseClientConfig, logSupabaseEnvProof } from './supabaseEnv.js';

export const supabaseClientConfig = getSupabaseClientConfig();
export const isSupabaseClientReal = supabaseClientConfig.hasValidConfig;
export const isSupabaseClientEnabled = !isOwnerPreview() && supabaseClientConfig.hasValidConfig; // Always enabled (either real or mock) to allow app booting
export const isSupabaseMocked = !isSupabaseClientReal;
export const supabaseConfigErrorMessage = isSupabaseMocked ? null : supabaseClientConfig.frontendEnvError;

export interface AuthConnectivityProbeResult {
  urlOrigin: string | null;
  urlPath: string;
  status: number | null;
  ok: boolean;
  errorName: string | null;
  errorMessage: string | null;
  isFetchFailure: boolean;
}

if (supabaseClientConfig.frontendEnvError && !isSupabaseMocked) {
  console.error(supabaseClientConfig.frontendEnvError);
}

if (supabaseClientConfig.warningMessage && !isSupabaseMocked) {
  console.warn(supabaseClientConfig.warningMessage);
}

if (isSupabaseMocked) {
  console.info('[HashiBot] Running in high-fidelity in-memory Mock Demo Mode.');
} else {
  logSupabaseEnvProof(supabaseClientConfig);
}

// Create mock supabase client for offline / demo preview mode
class MockSupabaseClient {

  // High-fidelity Mock Tables
  public tables: Record<string, any[]> = {
    profiles: [
      { id: 'mock-admin-id', email: 'admin@hashibot.io', full_name: 'System Admin', role: 'admin', created_at: new Date().toISOString() },
      { id: 'mock-user-id', email: 'user@hashibot.io', full_name: 'Demo User', role: 'user', created_at: new Date().toISOString() }
    ],
    scanner_config: [
      {
        id: 1,
        is_enabled: true,
        schedule_enabled: true,
        scan_interval_minutes: 5,
        signal_enable_crypto: true,
        signal_enable_forex: true,
        scan_crypto_enabled: true,
        scan_forex_enabled: true,
        auto_send_telegram: true,
        allow_demo_telegram_sending: true,
        min_auto_send_grade: 'A',
        cron_job_active: true,
        cron_job_name: 'market-scanner-cron',
        last_scheduled_scan_at: new Date(Date.now() - 3 * 60000).toISOString(),
        last_manual_scan_at: new Date(Date.now() - 15 * 60000).toISOString(),
        heartbeat_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    provider_status: [
      { provider: 'binance_testnet', status: 'healthy', latency_ms: 35, last_checked_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() },
      { provider: 'bybit_testnet', status: 'healthy', latency_ms: 42, last_checked_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() },
      { provider: 'mt5_personal', status: 'healthy', latency_ms: 78, last_checked_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() },
      { provider: 'mt5_prop', status: 'healthy', latency_ms: 124, last_checked_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }
    ],
    signals: [
      {
        id: 'signal-1',
        symbol: 'BTC/USDT',
        market_type: 'crypto',
        direction: 'BUY',
        entry_price: 68500,
        tp1: 69500,
        tp2: 70500,
        tp3: 72000,
        sl: 67500,
        status: 'active',
        data_source: 'REAL DATA',
        timeframe: '5m',
        strategy_name: 'compression-breakout',
        created_at: new Date(Date.now() - 10 * 60000).toISOString(),
        expires_at: new Date(Date.now() + 50 * 60000).toISOString()
      },
      {
        id: 'signal-2',
        symbol: 'ETH/USDT',
        market_type: 'crypto',
        direction: 'SELL',
        entry_price: 3520,
        tp1: 3450,
        tp2: 3400,
        tp3: 3300,
        sl: 3580,
        status: 'tp1_hit',
        data_source: 'REAL DATA',
        timeframe: '15m',
        strategy_name: 'trend-pullback',
        created_at: new Date(Date.now() - 45 * 60000).toISOString(),
        expires_at: new Date(Date.now() + 15 * 60000).toISOString()
      },
      {
        id: 'signal-3',
        symbol: 'EUR/USD',
        market_type: 'forex',
        direction: 'BUY',
        entry_price: 1.08500,
        tp1: 1.08900,
        tp2: 1.09200,
        sl: 1.08100,
        status: 'new',
        data_source: 'REAL DATA',
        timeframe: '1h',
        strategy_name: 'london-breakout',
        created_at: new Date(Date.now() - 5 * 60000).toISOString(),
        expires_at: new Date(Date.now() + 180 * 60000).toISOString()
      }
    ],
    scanner_runs: [
      {
        id: 'run-1',
        started_at: new Date(Date.now() - 3 * 60000).toISOString(),
        completed_at: new Date(Date.now() - 2.8 * 60000).toISOString(),
        run_type: 'scheduled',
        status: 'success',
        is_automatic: true,
        source: 'pg_cron',
        triggered_by: 'pg_cron',
        signals_detected: 1,
        signals_approved: 1,
        telegram_sent_count: 1,
        telegram_skipped_count: 0
      }
    ],
    telegram_deliveries: [],
    telegram_delivery_health: [
      { destination_channel: 'VIP Channel', sent_count: 42, failed_count: 0, skipped_count: 2, last_success_at: new Date().toISOString(), last_failure_at: null, last_delivery_at: new Date().toISOString() }
    ],
    intelligence_event_health: [
      { event_type: 'market_anomaly', last_generated_at: new Date().toISOString(), generated_count: 5, failed_count: 0, last_status: 'success', last_confidence: 0.89 }
    ],
    intelligence_feed_health: [
      { feed_type: 'Binance Orderbook', status: 'available', classification: 'high_quality', source: 'binance', freshness: '1s', error_message: null, last_updated_at: new Date().toISOString() }
    ],
    intelligence_events: [],
    signal_updates: [],
    audit_logs: [],
    trade_management_truth: [
      {
        provider: 'binance',
        environment: 'testnet',
        symbol: 'BTCUSDT',
        side: 'long',
        status: 'entry_filled',
        qty: 0.25,
        entry_price: 68500,
        mark_price: 68650,
        unrealized_pnl: 37.5,
        exchange_position_id: 'pos-binance-btc',
        signal_id: 'sig-binance-btc',
        execution_order_id: 'exec-binance-btc',
        sl_present: false,
        tp1_present: true,
        tp2_present: true,
        protection_status: 'missing_sl',
        profit_lock_status: 'inactive',
        monitor_status: 'synced',
        recovery_status: 'none',
        latest_error: 'Missing Stop Loss order on Binance Testnet exchange',
        latest_sync_at: new Date().toISOString(),
        last_action_taken: 'syncProviderPositions',
        repair_attempts: 0
      },
      {
        provider: 'bybit',
        environment: 'testnet',
        symbol: 'ETHUSDT',
        side: 'short',
        status: 'entry_filled',
        qty: 1.5,
        entry_price: 3500,
        mark_price: 3495,
        unrealized_pnl: 7.5,
        exchange_position_id: 'pos-bybit-eth',
        signal_id: 'sig-bybit-eth',
        execution_order_id: 'exec-bybit-eth',
        sl_present: true,
        tp1_present: false,
        tp2_present: false,
        protection_status: 'missing_tp',
        profit_lock_status: 'inactive',
        monitor_status: 'synced',
        recovery_status: 'none',
        latest_error: 'Missing Take Profit orders on Bybit Testnet exchange',
        latest_sync_at: new Date().toISOString(),
        last_action_taken: 'syncProviderPositions',
        repair_attempts: 0
      }
    ]
  };

  // Offline data never authenticates anyone or fabricates a Supabase session.
  public auth = previewClient.auth;

  public rpc = async (name: string, args: any) => {
    if (name === 'no_admin_exists') {
      const hasAdmin = this.tables.profiles.some(p => p.role === 'admin');
      return { data: !hasAdmin, error: null };
    }
    return { data: null, error: null };
  };

  public from = (table: string) => {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    const list = this.tables[table];

    const builder: any = {
      data: list,
      filters: [] as any[],
      limitVal: null as number | null,
      orderCol: null as string | null,
      orderAscending: true,

      select: (columns?: string, options?: any) => {
        if (options?.count) {
          const qResult = {
            data: null,
            error: null,
            count: list.length
          };
          return Object.assign(Promise.resolve(qResult), builder);
        }
        return builder;
      },

      ilike: (col: string, val: string) => {
        return builder;
      },

      like: (col: string, val: string) => {
        return builder;
      },

      or: (val: string) => {
        return builder;
      },

      neq: (col: string, val: any) => {
        builder.filters.push((row: any) => row[col] !== val);
        return builder;
      },

      in: (col: string, vals: any[]) => {
        builder.filters.push((row: any) => vals.includes(row[col]));
        return builder;
      },

      eq: (col: string, val: any) => {
        builder.filters.push((row: any) => row[col] === val);
        return builder;
      },

      order: (col: string, options?: any) => {
        builder.orderCol = col;
        builder.orderAscending = options?.ascending !== false;
        return builder;
      },

      limit: (val: number) => {
        builder.limitVal = val;
        return builder;
      },

      insert: (record: any) => {
        const records = Array.isArray(record) ? record : [record];
        const inserted: any[] = [];
        records.forEach(r => {
          const newRec = { id: r.id || 'id-' + Math.random().toString(36).substring(7), created_at: new Date().toISOString(), ...r };
          list.push(newRec);
          inserted.push(newRec);
        });
        const qResult = { data: Array.isArray(record) ? inserted : inserted[0], error: null };
        return Object.assign(Promise.resolve(qResult), builder);
      },

      update: (fields: any) => {
        let matches = [...list];
        builder.filters.forEach((f: any) => {
          matches = matches.filter(f);
        });
        matches.forEach(m => {
          Object.assign(m, fields);
        });
        const qResult = { data: matches[0] || null, error: null };
        return Object.assign(Promise.resolve(qResult), builder);
      },

      delete: () => {
        let matches = [...list];
        builder.filters.forEach((f: any) => {
          matches = matches.filter(f);
        });
        matches.forEach(m => {
          const idx = list.indexOf(m);
          if (idx !== -1) list.splice(idx, 1);
        });
        const qResult = { data: {}, error: null };
        return Object.assign(Promise.resolve(qResult), builder);
      },

      maybeSingle: () => {
        let filtered = [...list];
        builder.filters.forEach((f: any) => {
          filtered = filtered.filter(f);
        });
        const qResult = { data: filtered[0] || null, error: null };
        return Object.assign(Promise.resolve(qResult), builder);
      },

      single: () => {
        let filtered = [...list];
        builder.filters.forEach((f: any) => {
          filtered = filtered.filter(f);
        });
        const qResult = { data: filtered[0] || null, error: null };
        return Object.assign(Promise.resolve(qResult), builder);
      },

      then: (onfulfilled: any, onrejected: any) => {
        let result = [...list];
        builder.filters.forEach((f: any) => {
          result = result.filter(f);
        });
        if (builder.orderCol) {
          result.sort((a, b) => {
            const valA = a[builder.orderCol!];
            const valB = b[builder.orderCol!];
            if (valA < valB) return builder.orderAscending ? -1 : 1;
            if (valA > valB) return builder.orderAscending ? 1 : -1;
            return 0;
          });
        }
        if (builder.limitVal !== null) {
          result = result.slice(0, builder.limitVal);
        }

        return Promise.resolve({ data: result, error: null }).then(onfulfilled, onrejected);
      }
    };

    return builder;
  }
}

const safeClientUrl = supabaseClientConfig.hasValidConfig
  ? supabaseClientConfig.supabaseUrl
  : EXPECTED_SUPABASE_ORIGIN;
const safeClientKey = supabaseClientConfig.hasValidConfig
  ? supabaseClientConfig.supabaseKey
  : 'disabled-browser-supabase-client-config-invalid';

const applicationClient: any = isOwnerPreview() ? null : isSupabaseMocked
  ? new MockSupabaseClient() 
  : createClient(safeClientUrl, safeClientKey);

// Explicit preview selects only the local projection adapter, never offline fake auth.
export const supabase: any = isOwnerPreview() ? previewClient : applicationClient;

function isFetchFailure(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'TypeError'
    || /failed to fetch/i.test(message)
    || /network/i.test(message)
    || /fetch/i.test(message)
    || /cors/i.test(message);
}

function authProbeUrl(config = getSupabaseClientConfig(), path = '/auth/v1/settings'): URL {
  return new URL(path, config.supabaseUrl || EXPECTED_SUPABASE_ORIGIN);
}

async function fetchAuthProbe(target: URL, apiKey: string): Promise<AuthConnectivityProbeResult> {
  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });

    return {
      urlOrigin: target.origin,
      urlPath: target.pathname,
      status: response.status,
      ok: response.ok,
      errorName: response.ok ? null : 'AuthProbeHttpError',
      errorMessage: response.ok ? null : `Auth probe returned HTTP ${response.status}`,
      isFetchFailure: false,
    };
  } catch (error) {
    return {
      urlOrigin: target.origin,
      urlPath: target.pathname,
      status: null,
      ok: false,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
      isFetchFailure: isFetchFailure(error),
    };
  }
}

export function getAuthConnectivityProbeTarget(): Pick<AuthConnectivityProbeResult, 'urlOrigin' | 'urlPath'> {
  try {
    const target = authProbeUrl();
    return { urlOrigin: target.origin, urlPath: target.pathname };
  } catch {
    return { urlOrigin: null, urlPath: '/auth/v1/settings' };
  }
}

export async function probeSupabaseAuthConnectivity(): Promise<AuthConnectivityProbeResult> {
  const config = getSupabaseClientConfig();
  let target: URL;

  try {
    target = authProbeUrl(config);
  } catch (error) {
    return {
      urlOrigin: null,
      urlPath: '/auth/v1/settings',
      status: null,
      ok: false,
      errorName: error instanceof Error ? error.name : 'Error',
      errorMessage: error instanceof Error ? error.message : String(error),
      isFetchFailure: false,
    };
  }

  if (!config.hasValidConfig) {
    return {
      urlOrigin: target.origin,
      urlPath: target.pathname,
      status: null,
      ok: false,
      errorName: 'SupabaseConfigError',
      errorMessage: config.frontendEnvError ?? 'Supabase frontend config invalid',
      isFetchFailure: false,
    };
  }

  const settingsResult = await fetchAuthProbe(target, config.supabaseKey);
  if (settingsResult.status !== 404 && settingsResult.status !== 405) {
    return settingsResult;
  }

  // Older/newer GoTrue deployments may not expose /settings. In that case, fall
  // back to the safe health endpoint so the login page can distinguish auth
  // reachability from credential/user failures without exposing any secret.
  const healthTarget = authProbeUrl(config, '/auth/v1/health');
  return fetchAuthProbe(healthTarget, config.supabaseKey);
}
