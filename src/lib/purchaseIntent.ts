const KEY = 'hashibot.purchase-intent.v1';
const ATTEMPT_PREFIX = 'hashibot.purchase-attempt.v1.';

export type PurchaseIntent = {
  product: 'FREE_SIGNALS' | 'VIP_SIGNALS' | 'FOUNDING_AUTO_EXECUTION';
  provider?: 'MPESA' | 'WHOP';
  termDays?: 7 | 30;
  executionAccountId?: string;
  attribution?: Record<string, string | undefined>;
};

export function savePurchaseIntent(intent: PurchaseIntent) {
  sessionStorage.setItem(KEY, JSON.stringify(intent));
}

export function readPurchaseIntent(): PurchaseIntent | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') as PurchaseIntent | null; }
  catch { return null; }
}

export function authResumePath() {
  return `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Reuses one key for retries of the same selected offer. A different offer is a different attempt scope. */
export function getOrCreatePurchaseAttemptKey(scope: string, storage: AttemptStorage = sessionStorage) {
  const key = `${ATTEMPT_PREFIX}${scope}`;
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

export function clearPurchaseAttemptKey(scope: string, storage: AttemptStorage = sessionStorage) {
  storage.removeItem(`${ATTEMPT_PREFIX}${scope}`);
}
