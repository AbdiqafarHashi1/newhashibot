const KEY = 'hashibot.purchase-intent.v1';
const ATTEMPT_PREFIX = 'hashibot.purchase-attempt.v2.';

export type PurchaseIntent = {
  product: 'FREE_SIGNALS' | 'VIP_SIGNALS' | 'FOUNDING_AUTO_EXECUTION';
  provider?: 'MPESA' | 'WHOP'; termDays?: 7 | 30; executionAccountId?: string;
  attribution?: Record<string, string | undefined>;
};
export type PurchaseAttemptState = 'READY'|'PENDING'|'UNCERTAIN'|'COMPLETED'|'CANCELLED'|'EXPIRED'|'FAILED';
export interface PurchaseAttempt { key:string; customerId:string; selection:string; state:PurchaseAttemptState; checkoutId?:string; updatedAt:string; }
type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'length' | 'key'>>;
const terminal = new Set<PurchaseAttemptState>(['COMPLETED','CANCELLED','EXPIRED','FAILED']);
const clean=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9+_.:-]/g,'');
export function purchaseAttemptScope(customerId:string, selection:string){ if(!customerId.trim()) throw new Error('CUSTOMER_REQUIRED'); return `${clean(customerId)}.${clean(selection)}`; }
const storageKey=(scope:string)=>`${ATTEMPT_PREFIX}${scope}`;
export function savePurchaseIntent(intent: PurchaseIntent) { sessionStorage.setItem(KEY, JSON.stringify(intent)); }
export function readPurchaseIntent(): PurchaseIntent | null { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') as PurchaseIntent | null; } catch { return null; } }
export function authResumePath() { return `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`; }
export function readPurchaseAttempt(scope:string, storage:AttemptStorage=sessionStorage):PurchaseAttempt|null { const raw=storage.getItem(storageKey(scope)); if(!raw)return null; try { return JSON.parse(raw) as PurchaseAttempt; } catch { return {key:raw,customerId:scope.split('.')[0]||'legacy',selection:scope,state:'READY',updatedAt:new Date(0).toISOString()}; } }
/** Same customer + immutable selection reuses one attempt until canonical/provider evidence makes it terminal. */
export function getOrCreatePurchaseAttemptKey(scope:string, storage:AttemptStorage=sessionStorage) { const prior=readPurchaseAttempt(scope,storage); if(prior)return prior.key; const row:PurchaseAttempt={key:crypto.randomUUID(),customerId:scope.split('.')[0]||'legacy',selection:scope,state:'READY',updatedAt:new Date().toISOString()}; storage.setItem(storageKey(scope),JSON.stringify(row)); return row.key; }
export function updatePurchaseAttempt(scope:string,state:PurchaseAttemptState,checkoutId?:string,storage:AttemptStorage=sessionStorage){ const prior=readPurchaseAttempt(scope,storage); if(!prior)throw new Error('PURCHASE_ATTEMPT_NOT_FOUND'); const next={...prior,state,checkoutId:checkoutId??prior.checkoutId,updatedAt:new Date().toISOString()}; storage.setItem(storageKey(scope),JSON.stringify(next)); return next; }
/** Explicit only: refuses to rotate a pending/uncertain key, preventing a second charge. */
export function startNewPurchase(scope:string, storage:AttemptStorage=sessionStorage){ const prior=readPurchaseAttempt(scope,storage); if(prior&&!terminal.has(prior.state))throw new Error('RECOVER_EXISTING_PURCHASE'); storage.removeItem(storageKey(scope)); return getOrCreatePurchaseAttemptKey(scope,storage); }
export function canStartNewPurchase(scope:string,storage:AttemptStorage=sessionStorage){const prior=readPurchaseAttempt(scope,storage);return !prior||terminal.has(prior.state);}
export function clearPurchaseAttemptKey(scope:string,storage:AttemptStorage=sessionStorage){storage.removeItem(storageKey(scope));}
/** Call on logout/account switch so no customer's attempt key can leak into another identity. */
export function clearPurchaseAttemptsForCustomer(customerId:string,storage:AttemptStorage=sessionStorage,knownScopes:string[]=[]){for(const selection of knownScopes)storage.removeItem(storageKey(purchaseAttemptScope(customerId,selection)));}

export function updatePurchaseAttemptByCheckout(checkoutId:string,state:PurchaseAttemptState,storage:AttemptStorage=sessionStorage){ if(storage.length===undefined||!storage.key)return false; for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(ATTEMPT_PREFIX))continue;const scope=key.slice(ATTEMPT_PREFIX.length),row=readPurchaseAttempt(scope,storage);if(row?.checkoutId===checkoutId){updatePurchaseAttempt(scope,state,checkoutId,storage);return true}}return false;}
