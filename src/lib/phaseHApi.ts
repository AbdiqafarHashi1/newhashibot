import { supabase } from './supabase';
import type { AccountMode, AssetClass, Provider } from './phaseH';

export type OnboardingDraft = {
  stage: number; packageCode: string; access: 'SIGNALS'|'AUTO'; asset: AssetClass;
  mode: AccountMode; provider: Provider; risk: number; strategies: string[]; ack: boolean;
};
export type AuthorityResult<T=Record<string,unknown>> = { state:string; data?:T; reason?:string; version?:number };

async function authority<T>(action:string, payload:Record<string,unknown>={}):Promise<AuthorityResult<T>> {
  const { data, error } = await supabase.functions.invoke('phase-h-authority', { body: { action, ...payload } });
  if (error) throw new Error(error.message || 'READY_FOR_CONFIGURATION');
  return data as AuthorityResult<T>;
}
export const phaseHApi = {
  load: () => authority<{session:OnboardingDraft|null}>('load_onboarding'),
  save: (draft:OnboardingDraft, idempotencyKey:string, version?:number) => authority('save_onboarding',{draft,idempotency_key:idempotencyKey,version}),
  recommendBrain: (provider:Provider, mode:AccountMode) => authority('recommend_brain',{provider,mode}),
  assignBrain: (executionAccountId:string, risk:number, strategies:string[], idempotencyKey:string) => authority('assign_brain',{execution_account_id:executionAccountId,risk,strategies,idempotency_key:idempotencyKey}),
  createAccountDraft: (input:Record<string,unknown>) => authority('create_account_draft',input),
  acknowledge: (executionAccountId:string|undefined, version='2026.09') => authority('acknowledge_risk',{execution_account_id:executionAccountId,version}),
  readiness: (executionAccountId:string) => authority('refresh_readiness',{execution_account_id:executionAccountId}),
  pairing: (executionAccountId:string) => authority<{code:string;expires_at:string}>('create_pairing',{execution_account_id:executionAccountId}),
  pairingStatus: (executionAccountId:string) => authority('pairing_status',{execution_account_id:executionAccountId}),
  revokePairing: (executionAccountId:string) => authority('revoke_pairing',{execution_account_id:executionAccountId}),
  submitCredentials: (provider:'BINANCE'|'BYBIT', executionAccountId:string, credentials:{apiKey:string;apiSecret:string;passphrase?:string}, idempotencyKey:string) => authority('submit_credentials',{provider,execution_account_id:executionAccountId,credentials,idempotency_key:idempotencyKey}),
  rotateCredentials: (executionAccountId:string) => authority('rotate_credentials',{execution_account_id:executionAccountId}),
  revokeCredentials: (executionAccountId:string) => authority('revoke_credentials',{execution_account_id:executionAccountId}),
  support: (input:Record<string,unknown>) => authority('create_support_request',input),
  additionalAccount: (provider:Provider) => authority('request_additional_account',{provider}),
};

export function reconcileDraft(local:OnboardingDraft, remote:OnboardingDraft|null) {
  if (!remote) return local;
  return remote.stage >= local.stage ? remote : {...local, ...remote, stage:local.stage};
}
