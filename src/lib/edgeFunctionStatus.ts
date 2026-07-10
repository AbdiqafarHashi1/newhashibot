/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFrontendSupabaseUrl } from './supabaseEnv';
import { supabase, isSupabaseMocked } from './supabase';
export type EdgeFunctionReachability = 'deployed' | 'missing' | 'forbidden' | 'unreachable' | 'unknown';

export interface EdgeFunctionCallResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  text: string;
  reachability: EdgeFunctionReachability;
  message: string;
}

function classify(status: number, text: string, functionName: string): { reachability: EdgeFunctionReachability; message: string } {
  const lower = text.toLowerCase();
  if (status === 404 || lower.includes('function not found') || lower.includes('not found')) {
    return {
      reachability: 'missing',
      message: `${functionName} function is not deployed yet.`,
    };
  }
  if (status === 401 || status === 403) {
    return { reachability: 'forbidden', message: `${functionName} rejected the current user/admin authorization.` };
  }
  if (status >= 200 && status < 500) return { reachability: 'deployed', message: `${functionName} is deployed.` };
  return { reachability: 'unreachable', message: `${functionName} is unreachable or returned HTTP ${status}.` };
}

export async function callEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  token?: string | null,
): Promise<EdgeFunctionCallResult<T>> {
  if (isSupabaseMocked) {
    // Return mock successful response for key edge functions
    let mockData: any = { success: true };
    if (functionName === 'market-scanner') {
      mockData = {
        success: true,
        provider: 'binance_testnet',
        crypto_provider: 'binance',
        market_mode: 'crypto_and_forex',
        signal_enable_crypto: true,
        signal_enable_forex: true,
        telegram_enabled: true,
        enable_signal_mode_output: true
      };
    } else if (functionName === 'admin-scheduler-action') {
      mockData = {
        success: true,
        status: 'active',
        message: 'Mock scheduler action is active and healthy.'
      };
    } else if (functionName === 'admin-operator-action') {
      const action = String(body.action ?? '');
      
      // Simulate Live Multi-User Lock
      const lockKey = `hashibot_lock_${action}`;
      const now = Date.now();
      const existingLock = localStorage.getItem(lockKey);
      
      if (existingLock && now - Number(existingLock) < 8000) {
        // Lock collision simulation
        mockData = {
          success: false,
          error: 'MUTEX_LOCK_CONFLICT',
          blocker: `Action '${action}' is currently locked by another operator run.`,
          result_summary: 'Overlapping operator execution blocked by Live Sync Lock.'
        };
      } else {
        // Acquire Lock
        localStorage.setItem(lockKey, now.toString());
        
        // Handle specific administrative actions
        if (action === 'repair_protection_now') {
          const truthList = supabase.tables['trade_management_truth'] || [];
          const affected: string[] = [];
          
          truthList.forEach((row: any) => {
            if (row.protection_status !== 'protected') {
              row.sl_present = true;
              row.tp1_present = true;
              row.tp2_present = true;
              row.protection_status = 'protected';
              row.recovery_status = 'repair_succeeded';
              row.last_action_taken = 'recreated_protection_orders';
              row.latest_error = null;
              row.latest_sync_at = new Date().toISOString();
              row.repair_attempts = Number(row.repair_attempts ?? 0) + 1;
              affected.push(row.symbol);
            }
          });
          
          mockData = {
            success: true,
            status: 'SUCCESS',
            result_summary: `Successfully repaired protection for symbols: ${affected.join(', ') || 'None'}.`,
            affected_symbols: affected,
            duration_ms: 150,
            started_at: new Date(now).toISOString(),
            finished_at: new Date().toISOString()
          };
        } else if (action === 'run_binance_monitor_now' || action === 'run_bybit_monitor_now' || action === 'run_supervisor_now') {
          const targetProvider = action.includes('binance') ? 'binance' : action.includes('bybit') ? 'bybit' : 'binance';
          const truthList = supabase.tables['trade_management_truth'] || [];
          const affected: string[] = [];
          
          truthList.forEach((row: any) => {
            if (row.provider === targetProvider) {
              row.latest_sync_at = new Date().toISOString();
              row.last_action_taken = 'manual_monitor_sync_success';
              affected.push(row.symbol);
            }
          });
          
          mockData = {
            success: true,
            status: 'SUCCESS',
            result_summary: `Monitor run succeeded. Synced ${affected.length} open position rows.`,
            duration_ms: 200,
            started_at: new Date(now).toISOString(),
            finished_at: new Date().toISOString()
          };
        } else if (action === 'run_runtime_proof') {
          mockData = {
            success: true,
            status: 'PASS',
            can_operate_testnet_demo_now: true,
            blockers: [],
            checks: [
              { check: 'binance_exposure_fetch_reachable', status: 'PASS' },
              { check: 'bybit_exposure_fetch_reachable', status: 'PASS' },
              { check: 'cron_jobs_visible', status: 'PASS' },
              { check: 'supervisor_heartbeat_visible', status: 'PASS' },
              { check: 'scanner_config_visible', status: 'PASS' }
            ],
            duration_ms: 300,
            live_trading_disabled: true
          };
        } else {
          mockData = {
            success: true,
            status: 'SUCCESS',
            result_summary: `Operator action '${action}' completed successfully in Mock Sandbox.`,
            duration_ms: 100,
            started_at: new Date(now).toISOString(),
            finished_at: new Date().toISOString()
          };
        }
        
        // Release Lock with a tiny delay
        setTimeout(() => {
          localStorage.removeItem(lockKey);
        }, 1000);
      }
    }
    
    return {
      ok: mockData.success !== false,
      status: mockData.success !== false ? 200 : 409,
      data: mockData as T,
      text: JSON.stringify(mockData),
      reachability: 'deployed',
      message: `${functionName} is mocked and deployed.`
    };
  }

  try {
    const supabaseUrl = getFrontendSupabaseUrl();
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? JSON.parse(text) as T : null;
    } catch {
      data = null;
    }
    const classified = classify(res.status, text, functionName);
    return {
      ok: res.ok,
      status: res.status,
      data,
      text,
      ...classified,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      data: null,
      text: errMsg,
      reachability: 'unreachable',
      message: `Failed to fetch edge function: ${errMsg}`
    };
  }
}

export const ADMIN_SCHEDULER_MISSING_MESSAGE = 'Admin scheduler action function is not deployed yet.';
export const ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS = 'Deploy supabase/functions/admin-scheduler-action/index.ts in Supabase Edge Functions, then test again.';
