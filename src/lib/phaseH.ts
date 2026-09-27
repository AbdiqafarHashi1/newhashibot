/** Phase H onboarding projections. Execution decisions remain owned by Phase D. */
export type PackageCode = 'FREE_SIGNALS' | 'VIP_SIGNALS' | 'AUTO_EXECUTION' | 'FOUNDING_AUTO_EXECUTION' | 'FOUNDING_PROP_EXECUTION';
export type Provider = 'MT5' | 'BINANCE' | 'BYBIT';
export type AccountMode = 'PERSONAL' | 'PROP';
export type AssetClass = 'FOREX' | 'CRYPTO';
export type Readiness = 'DRAFT' | 'AWAITING_PAYMENT' | 'AWAITING_PROVIDER' | 'AWAITING_PAIRING' | 'AWAITING_VERIFICATION' | 'AWAITING_ACKNOWLEDGEMENT' | 'AWAITING_CERTIFICATION' | 'READY_FOR_CONFIGURATION' | 'READY_FOR_DEMO' | 'DEGRADED' | 'LOCKED' | 'SUSPENDED' | 'BLOCKED';

export const PHASE_H_STAGES = ['Welcome & package','Access type','Markets','Account purpose','Provider','Experience','Risk preference','Strategies','Brain recommendation','Provider connection','Acknowledgements','Readiness review','Completion'] as const;
export const SANDBOX_ENVIRONMENTS = { MT5: 'demo', BINANCE: 'testnet', BYBIT: 'demo' } as const;
export const PRODUCT_CATALOG = [
  { code: 'FREE_SIGNALS', name: 'Free Signals', checkout: false },
  { code: 'VIP_SIGNALS', name: 'VIP Signals', checkout: true },
  { code: 'AUTO_EXECUTION', name: 'Auto Execution', checkout: true },
  { code: 'FOUNDING_AUTO_EXECUTION', name: 'HashiBot Auto Execution — Founding 20', checkout: true, priceCents: 10000, currency: 'USD', interval: 'month', capacity: 20, billingUnit: 'connected execution account' },
] as const;
export const CANONICAL_SHARE_ROUTES = ['/free','/vip','/pricing','/execution','/execution/mt5','/execution/crypto','/execution/prop'] as const;
export const SUPPORT_SECRET_WARNING = 'HashiBot support will never ask you to send API secrets, MT5 passwords or private keys through WhatsApp.';

export type BrainProfile = { family: string; version: string; provider: Provider; mode: AccountMode; minRisk: number; maxRisk: number; strategies: readonly string[]; certificationRequired: boolean };
export const APPROVED_BRAINS: readonly BrainProfile[] = [
  { family:'PERSONAL_MT5_GROWTH', version:'2026.09', provider:'MT5', mode:'PERSONAL', minRisk:.1, maxRisk:1, strategies:['FOREX_TREND','GOLD_BREAKOUT'], certificationRequired:true },
  { family:'PERSONAL_BINANCE_CRYPTO', version:'2026.09', provider:'BINANCE', mode:'PERSONAL', minRisk:.1, maxRisk:.75, strategies:['CRYPTO_TREND'], certificationRequired:true },
  { family:'PERSONAL_BYBIT_CRYPTO', version:'2026.09', provider:'BYBIT', mode:'PERSONAL', minRisk:.1, maxRisk:.75, strategies:['CRYPTO_TREND'], certificationRequired:true },
  { family:'PROP_MT5_STRICT', version:'2026.09', provider:'MT5', mode:'PROP', minRisk:.1, maxRisk:.5, strategies:['FOREX_TREND'], certificationRequired:true },
] as const;

export function recommendBrain(provider: Provider, mode: AccountMode) {
  const profile = APPROVED_BRAINS.find(p => p.provider === provider && p.mode === mode);
  if (!profile) throw new Error('UNSUPPORTED_PROVIDER_MODE');
  return profile;
}
export function validatePreferences(profile: BrainProfile, risk: number, strategies: string[]) {
  if (risk < profile.minRisk || risk > profile.maxRisk) throw new Error('RISK_OUTSIDE_APPROVED_RANGE');
  if (strategies.some(s => !profile.strategies.includes(s))) throw new Error('STRATEGY_NOT_APPROVED');
  return { risk, strategies };
}
export function validProviderCombination(provider: Provider, asset: AssetClass, mode: AccountMode) {
  return provider === 'MT5' ? asset === 'FOREX' : asset === 'CRYPTO' && mode === 'PERSONAL';
}

export type ReadinessInput = { onboardingComplete:boolean; entitlement:'ACTIVE'|'TRIAL'|'PENDING'|'GRACE'|'EXPIRED'|'CANCELLED'|'SUSPENDED'; acknowledged:boolean; provider:Provider; connection:'NOT_STARTED'|'AWAITING_PAIRING'|'VERIFYING'|'CONNECTED'|'READY_FOR_CONFIGURATION'|'DEGRADED'|'BLOCKED'; brainAssigned:boolean; configurationValid:boolean; certification:'NOT_REQUIRED'|'REQUIRED'|'PASSED'|'FAILED'; incident:boolean; locked:boolean; termsAccepted:boolean; environment:string };
export function projectReadiness(i: ReadinessInput): { state:Readiness; reasons:string[]; executionEnabled:false } {
  const reasons:string[]=[];
  if (!i.onboardingComplete) reasons.push('ONBOARDING_INCOMPLETE');
  if (i.environment === 'live' || !Object.values(SANDBOX_ENVIRONMENTS).includes(i.environment as never)) reasons.push('LIVE_ENVIRONMENT_FORBIDDEN');
  if (i.entitlement === 'SUSPENDED') return {state:'SUSPENDED',reasons:['ENTITLEMENT_SUSPENDED'],executionEnabled:false};
  if (!['ACTIVE','TRIAL','GRACE'].includes(i.entitlement)) reasons.push('ACTIVE_ENTITLEMENT_REQUIRED');
  if (i.locked || i.incident) return {state:'LOCKED',reasons:[i.locked?'ACCOUNT_LOCKED':'OPEN_SAFETY_INCIDENT'],executionEnabled:false};
  if (!i.acknowledged || !i.termsAccepted) reasons.push('CURRENT_ACKNOWLEDGEMENT_REQUIRED');
  if (!i.brainAssigned || !i.configurationValid) reasons.push('APPROVED_BRAIN_CONFIGURATION_REQUIRED');
  if (i.connection === 'NOT_STARTED') reasons.push('PROVIDER_CONNECTION_REQUIRED');
  if (i.connection === 'AWAITING_PAIRING') return {state:'AWAITING_PAIRING',reasons:['BRIDGE_PAIRING_REQUIRED'],executionEnabled:false};
  if (i.connection === 'VERIFYING') return {state:'AWAITING_VERIFICATION',reasons:['PROVIDER_VERIFICATION_PENDING'],executionEnabled:false};
  if (i.connection === 'BLOCKED' || reasons.includes('LIVE_ENVIRONMENT_FORBIDDEN')) return {state:'BLOCKED',reasons,executionEnabled:false};
  if (i.connection === 'DEGRADED') return {state:'DEGRADED',reasons:['PROVIDER_HEALTH_DEGRADED'],executionEnabled:false};
  if (!i.acknowledged || !i.termsAccepted) return {state:'AWAITING_ACKNOWLEDGEMENT',reasons,executionEnabled:false};
  if (!['ACTIVE','TRIAL','GRACE'].includes(i.entitlement)) return {state:'AWAITING_PAYMENT',reasons,executionEnabled:false};
  if (i.certification === 'REQUIRED') return {state:'AWAITING_CERTIFICATION',reasons:['PHASE_G_CERTIFICATION_REQUIRED'],executionEnabled:false};
  if (reasons.length) return {state:i.connection==='READY_FOR_CONFIGURATION'?'READY_FOR_CONFIGURATION':'DRAFT',reasons,executionEnabled:false};
  return {state:i.connection==='CONNECTED'&&i.certification==='PASSED'?'READY_FOR_DEMO':'READY_FOR_CONFIGURATION',reasons:i.connection==='CONNECTED'?[]:['EXTERNAL_CONFIGURATION_REQUIRED'],executionEnabled:false};
}

export class PairingAuthority {
  private records = new Map<string,{hash:string;customer:string;account:string;expires:number;used:boolean;attempts:number;revoked:boolean}>();
  constructor(private now=()=>Date.now()){}
  async create(customer:string, account:string, raw:string, ttlMs=10*60_000) { const hash=await digest(raw); this.records.set(account,{hash,customer,account,expires:this.now()+ttlMs,used:false,attempts:0,revoked:false}); return {code:raw,expiresAt:this.now()+ttlMs}; }
  async consume(customer:string, account:string, raw:string) { const r=this.records.get(account); if(!r||r.customer!==customer) throw new Error('PAIRING_OWNERSHIP_MISMATCH'); if(r.revoked||r.used) throw new Error('PAIRING_REPLAY_REJECTED'); if(this.now()>r.expires) throw new Error('PAIRING_CODE_EXPIRED'); if(++r.attempts>5) {r.revoked=true; throw new Error('PAIRING_ATTEMPTS_EXCEEDED');} if(await digest(raw)!==r.hash) throw new Error('PAIRING_INVALID'); r.used=true; return {state:'PAIRED' as const}; }
  revoke(account:string){ const r=this.records.get(account); if(r) r.revoked=true; }
}
async function digest(value:string) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export function bridgeHealth(lastHeartbeat:number, now:number, version:string, minimum='2.0.0') { if(version.localeCompare(minimum,undefined,{numeric:true})<0)return 'VERSION_OUTDATED'; const age=now-lastHeartbeat; return age<=60_000?'HEALTHY':age<=180_000?'DEGRADED':'OFFLINE'; }

export interface SecretStore { put(scope:string, secret:Record<string,string>):Promise<string>; revoke(ref:string):Promise<void>; }
export class MemorySecretStore implements SecretStore { private values=new Map<string,Record<string,string>>(); async put(scope:string,secret:Record<string,string>){const ref=`local://${scope}/${crypto.randomUUID()}`;this.values.set(ref,{...secret});return ref;} async revoke(ref:string){this.values.delete(ref);} }
export function redactSecrets<T extends Record<string,unknown>>(value:T) { const blocked=/secret|password|passphrase|api.?key|credential/i; return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,blocked.test(k)?'[REDACTED]':v])); }
export type ProviderVerification = { authenticated:boolean; trading:boolean; withdrawals:boolean; environmentMatches:boolean; health:boolean; symbols:boolean };
export function connectionState(v:ProviderVerification){ if(!v.health)return 'PROVIDER_UNAVAILABLE';if(!v.authenticated)return 'AUTHENTICATION_FAILED';if(!v.environmentMatches)return 'ENVIRONMENT_MISMATCH';if(v.withdrawals)return 'WITHDRAWAL_PERMISSION_REJECTED';if(!v.trading||!v.symbols)return 'CAPABILITY_REJECTED';return 'CONNECTED'; }
export interface PaymentAdapter { createCheckout(input:{customerId:string;product:PackageCode;idempotencyKey:string}):Promise<{state:'CHECKOUT_NOT_CONFIGURED';reference:string}> }
export class LocalPaymentAdapter implements PaymentAdapter { async createCheckout(i:{customerId:string;product:PackageCode;idempotencyKey:string}){return {state:'CHECKOUT_NOT_CONFIGURED' as const,reference:`local:${i.idempotencyKey}`};} }
export type PortableJob={kind:string;payload:Record<string,unknown>;customerId:string;executionAccountId?:string;idempotencyKey:string;attempt:number;maxAttempts:number;availableAt:string;createdAt:string;claimedAt?:string;completedAt?:string;deadLetteredAt?:string;cancelledAt?:string;safeError?:string;auditId:string;rateLimitKey:string;humanApprovalRequired:boolean};
