import { getFrontendSupabaseUrl } from './supabaseEnv';
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
}

export const ADMIN_SCHEDULER_MISSING_MESSAGE = 'Admin scheduler action function is not deployed yet.';
export const ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS = 'Deploy supabase/functions/admin-scheduler-action/index.ts in Supabase Edge Functions, then test again.';
