import { supabase } from './supabase';

export type VipCommerceState =
  | { state: 'ACTIVE'; expires_at?: string; provider?: string }
  | { state: 'MPESA_PENDING'; reference: string; submitted_at?: string }
  | { state: 'VERIFYING' | 'REJECTED' | 'NOT_FOUND'; reference?: string };

export type VipTelegramState = { state: 'INACTIVE' | 'NOT_LINKED' | 'LINKING' | 'LINKING_FAILED' | 'HEALTHY' | 'UNAUTHENTICATED'; telegram_user_id?: number; username?: string; access_state?: string; last_success_at?: string; safe_error?: string };

/** Reads server-authoritative customer_subscriptions/access_requests state through an authenticated RPC. */
export async function getMyVipCommerceStatus(): Promise<VipCommerceState> {
  const { data, error } = await supabase.rpc('my_vip_commerce_status');
  if (error) throw new Error(error.message);
  return data as VipCommerceState;
}

export async function adminReviewMpesaRequest(requestId: string, decision: 'APPROVE' | 'REJECT', reason: string) {
  const { data, error } = await supabase.rpc('admin_review_mpesa_request', { p_request_id: requestId, p_decision: decision, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminMutateVipEntitlement(userId: string, action: 'GRANT' | 'EXTEND' | 'REVOKE', durationDays: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_mutate_vip_entitlement', { p_user_id: userId, p_action: action, p_duration_days: durationDays, p_reason: reason });
  if (error) throw new Error(error.message);
  return data;
}

export async function getMyVipTelegramStatus(): Promise<VipTelegramState> {
  const { data, error } = await supabase.rpc('my_vip_telegram_status');
  if (error) throw new Error(error.message);
  return data as VipTelegramState;
}

export async function createVipTelegramOnboardingLink() {
  const {data,error}=await supabase.functions.invoke('phase-o-agents',{body:{action:'CUSTOMER_TELEGRAM_LINK'}});
  if(error||data?.error)throw Error('Your Telegram link is temporarily unavailable. Please try again.');
  if(data?.state==='LINKED')return {state:'LINKED' as const};
  if(typeof data?.url!=='string'||!/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=[a-f0-9]{48}$/i.test(data.url))throw Error('Your Telegram link could not be confirmed.');
  return {state:'ONBOARDING_REQUIRED' as const,url:data.url,expiresAt:data.expiresAt as string};
}

export async function adminCreateVipTelegramOnboardingLink(userId: string, reason = 'Admin resend') {
  const { data, error } = await supabase.rpc('admin_create_vip_telegram_onboarding', { p_user_id: userId, p_reason: reason });
  if (error) throw new Error(error.message);
  const botUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '');
  if (!botUsername || !data?.token) throw new Error('Telegram bot username is not configured.');
  return `https://t.me/${botUsername}?start=${data.token}`;
}
