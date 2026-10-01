const KEY = 'hashibot.purchase-intent.v1';

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
