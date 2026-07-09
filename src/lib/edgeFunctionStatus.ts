/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFrontendSupabaseUrl } from './supabaseEnv';
import { isSupabaseMocked } from './supabase';
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
    }
    
    return {
      ok: true,
      status: 200,
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
