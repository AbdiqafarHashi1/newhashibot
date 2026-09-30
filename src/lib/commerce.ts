import type { PackageCapability } from './packages';

export type CommerceProvider = 'WHOP' | 'MPESA' | 'MANUAL';
export type CommerceProduct =
  | 'HASHIBOT_VIP_SIGNALS'
  | 'PERSONAL_AUTO'
  | 'FOREX_PROP'
  | 'CRYPTO_PROP';

export interface CheckoutAttribution {
  source?: string;
  campaign?: string;
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  affiliate?: string;
}

export interface CommerceLifecycleRecord {
  product: CommerceProduct;
  provider: CommerceProvider;
  providerCustomerId?: string;
  paymentId?: string;
  subscriptionId?: string;
  membershipId?: string;
  transactionReference?: string;
  providerState: string;
  attribution?: CheckoutAttribution;
  createdAt: string;
  updatedAt: string;
}

export const PRODUCT_BY_PACKAGE: Partial<Record<PackageCapability, CommerceProduct>> = {
  crypto_signal_room: 'HASHIBOT_VIP_SIGNALS',
  forex_mt5_personal_bot: 'PERSONAL_AUTO',
  crypto_personal_bot: 'PERSONAL_AUTO',
  forex_mt5_prop_bot: 'FOREX_PROP',
  crypto_prop_bot: 'CRYPTO_PROP',
};

export const MPESA_KES_PRICES: Partial<Record<CommerceProduct, number>> = {
  HASHIBOT_VIP_SIGNALS: 3500,
};


export function readAttribution(params: URLSearchParams): CheckoutAttribution {
  return {
    source: params.get('source') || undefined,
    campaign: params.get('campaign') || undefined,
    ref: params.get('ref') || undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    utmContent: params.get('utm_content') || undefined,
    affiliate: params.get('affiliate') || params.get('aff') || undefined,
  };
}

const ATTRIBUTION_KEY = 'hashibot.checkout.attribution.v1';
export function captureAttribution(params: URLSearchParams): CheckoutAttribution {
  const incoming = readAttribution(params);
  let prior: CheckoutAttribution = {};
  try { prior = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}') as CheckoutAttribution; } catch { /* ignore invalid legacy browser state */ }
  const merged = { ...prior, ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value)) };
  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged));
  return merged;
}

export function serializeAttribution(attribution: CheckoutAttribution) {
  return JSON.stringify(Object.fromEntries(Object.entries(attribution).filter(([, value]) => value)));
}
