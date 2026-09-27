/** Phase I's provider-neutral commerce contracts. Database RPCs remain the production authority. */
export type CommerceProvider = 'WHOP' | 'MPESA';
export type ProductCode = 'FREE_SIGNALS' | 'VIP_SIGNALS' | 'FOUNDING_AUTO_EXECUTION';
export type CheckoutState = 'CREATED'|'SLOT_RESERVED'|'PROVIDER_PENDING'|'ACTION_REQUIRED'|'COMPLETED'|'EXPIRED'|'CANCELLED'|'FAILED'|'REVIEW_REQUIRED';
export type PaymentState = 'CREATED'|'PENDING'|'AUTHORIZED'|'SUCCEEDED'|'FAILED'|'CANCELLED'|'EXPIRED'|'REFUNDED'|'PARTIALLY_REFUNDED'|'DISPUTED'|'CHARGEBACK'|'REVERSED'|'REVIEW_REQUIRED';
export type SubscriptionState = 'PENDING'|'ACTIVE'|'GRACE'|'PAST_DUE'|'CANCEL_AT_PERIOD_END'|'CANCELLED'|'EXPIRED'|'SUSPENDED'|'REFUNDED'|'DISPUTED';

export const COMMERCE_VERSION = 'phase-i/1';
export const PRODUCTS = {
  FREE_SIGNALS: { name:'Free Signals', accountLimit:0, prices:{ USD:{amount:0,interval:null,providers:[] as CommerceProvider[]}, KES:{amount:0,interval:null,providers:[] as CommerceProvider[]} } },
  VIP_SIGNALS: { name:'VIP Signals', accountLimit:0, prices:{ USD:{amount:2900,interval:'month',providers:['WHOP'] as CommerceProvider[]}, KES:{amount:350000,interval:'30_days',providers:['MPESA'] as CommerceProvider[]} } },
  FOUNDING_AUTO_EXECUTION: { name:'Founding 20 Auto Execution', accountLimit:1, capacity:20, prices:{ USD:{amount:10000,interval:'month',providers:['WHOP'] as CommerceProvider[]} } },
} as const;

const transitions: Record<PaymentState, readonly PaymentState[]> = {
  CREATED:['PENDING','FAILED','CANCELLED','EXPIRED'], PENDING:['AUTHORIZED','SUCCEEDED','FAILED','CANCELLED','EXPIRED','REVIEW_REQUIRED'],
  AUTHORIZED:['SUCCEEDED','FAILED','CANCELLED','REVIEW_REQUIRED'], SUCCEEDED:['REFUNDED','PARTIALLY_REFUNDED','DISPUTED','CHARGEBACK','REVERSED'],
  PARTIALLY_REFUNDED:['REFUNDED','DISPUTED','CHARGEBACK'], DISPUTED:['SUCCEEDED','CHARGEBACK','REVERSED'], CHARGEBACK:['REVERSED'],
  FAILED:[], CANCELLED:[], EXPIRED:[], REFUNDED:[], REVERSED:[], REVIEW_REQUIRED:['SUCCEEDED','REFUNDED','FAILED'],
};
export function transitionPayment(from:PaymentState,to:PaymentState):PaymentState {
  if (from===to) return from;
  if (!transitions[from].includes(to)) throw new Error(`ILLEGAL_PAYMENT_TRANSITION:${from}:${to}`);
  return to;
}

export function canonicalPrice(product:ProductCode,currency:string,provider:CommerceProvider) {
  const prices = PRODUCTS[product].prices as Record<string,{amount:number;interval:string|null;providers:readonly CommerceProvider[]}|undefined>;
  const price=prices[currency];
  if (!price || !price.providers.includes(provider)) throw new Error('UNSUPPORTED_PROVIDER_OR_CURRENCY');
  return price;
}
export function safeReturnUrl(raw:string, origin:string) {
  const url=new URL(raw,origin), expected=new URL(origin);
  if (url.origin!==expected.origin || !url.pathname.startsWith('/')) throw new Error('UNSAFE_RETURN_URL');
  url.username=''; url.password=''; return url.toString();
}
export function sanitizeAttribution(value?:string) { return value?.trim().replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80) || undefined; }
export function normalizeKenyanPhone(raw:string) {
  const digits=raw.replace(/\D/g,'');
  const normalized=digits.startsWith('254')?digits:digits.startsWith('0')?`254${digits.slice(1)}`:digits.length===9?`254${digits}`:'';
  if (!/^254[17]\d{8}$/.test(normalized)) throw new Error('INVALID_KENYAN_PHONE');
  return `+${normalized}`;
}
export function maskPhone(phone:string) { const p=normalizeKenyanPhone(phone); return `${p.slice(0,4)}•••••${p.slice(-3)}`; }
export function maskReference(ref:string) { return ref.length<7?'••••':`${ref.slice(0,3)}••••${ref.slice(-3)}`; }

export interface ProviderAdapter {
  readonly provider:CommerceProvider; configuration(): 'READY'|'READY_FOR_CONFIGURATION';
  createCheckout(input:{checkoutId:string;amount:number;currency:string;customerReference:string;returnUrl:string}):Promise<{state:'PROVIDER_PENDING';externalReference:string;actionUrl?:string}|{state:'CHECKOUT_NOT_CONFIGURED'}>;
  verifyWebhook(raw:string,headers:Record<string,string>):Promise<boolean>;
  reconcile(reference:string):Promise<{state:PaymentState;reference:string}>;
}
export class DeterministicUnconfiguredAdapter implements ProviderAdapter {
  constructor(readonly provider:CommerceProvider){} configuration(){return 'READY_FOR_CONFIGURATION' as const;}
  async createCheckout(){return {state:'CHECKOUT_NOT_CONFIGURED' as const};}
  async verifyWebhook(){return false;} async reconcile(reference:string){return {state:'REVIEW_REQUIRED' as const,reference};}
}

/** Pure inventory model used by deterministic tests; SQL uses row locks for the real authority. */
export class FoundingInventory {
  private slots=new Map<number,{customer:string;checkout:string;state:'RESERVED'|'ACTIVE';expires:number}>();
  constructor(readonly capacity=20,private now=()=>Date.now()){}
  reserve(customer:string,checkout:string,ttlMs=15*60_000){this.releaseExpired();const prior=[...this.slots.entries()].find(([,v])=>v.checkout===checkout);if(prior)return prior[0];for(let n=1;n<=this.capacity;n++)if(!this.slots.has(n)){this.slots.set(n,{customer,checkout,state:'RESERVED',expires:this.now()+ttlMs});return n;}throw new Error('FOUNDING_CAPACITY_EXHAUSTED');}
  activate(checkout:string){this.releaseExpired();const item=[...this.slots.entries()].find(([,v])=>v.checkout===checkout);if(!item)throw new Error('PAYMENT_REVIEW_REQUIRED');item[1].state='ACTIVE';return item[0];}
  releaseExpired(){for(const [n,v] of this.slots)if(v.state==='RESERVED'&&v.expires<=this.now())this.slots.delete(n);}
  occupied(){this.releaseExpired();return this.slots.size;}
}

export function paymentMatchesCheckout(checkout:{amount:number;currency:string;product:ProductCode;customerId:string}, evidence:{amount:number;currency:string;product:ProductCode;customerId:string}) {
  if (checkout.amount!==evidence.amount) throw new Error('AMOUNT_MISMATCH');
  if (checkout.currency!==evidence.currency) throw new Error('CURRENCY_MISMATCH');
  if (checkout.product!==evidence.product) throw new Error('PRODUCT_MISMATCH');
  if (checkout.customerId!==evidence.customerId) throw new Error('CUSTOMER_MISMATCH');
  return true;
}
