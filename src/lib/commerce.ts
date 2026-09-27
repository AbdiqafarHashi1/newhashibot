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

const WHOP_PUBLIC_CONFIG: Record<CommerceProduct, { planId?: string; checkoutUrl?: string }> = {
  HASHIBOT_VIP_SIGNALS: {
    planId: import.meta.env.VITE_WHOP_PLAN_VIP_SIGNALS,
    checkoutUrl: import.meta.env.VITE_WHOP_CHECKOUT_VIP_SIGNALS,
  },
  PERSONAL_AUTO: {
    planId: import.meta.env.VITE_WHOP_PLAN_PERSONAL_AUTO,
    checkoutUrl: import.meta.env.VITE_WHOP_CHECKOUT_PERSONAL_AUTO,
  },
  FOREX_PROP: {
    planId: import.meta.env.VITE_WHOP_PLAN_FOREX_PROP,
    checkoutUrl: import.meta.env.VITE_WHOP_CHECKOUT_FOREX_PROP,
  },
  CRYPTO_PROP: {
    planId: import.meta.env.VITE_WHOP_PLAN_CRYPTO_PROP,
    checkoutUrl: import.meta.env.VITE_WHOP_CHECKOUT_CRYPTO_PROP,
  },
};

export function readAttribution(params: URLSearchParams): CheckoutAttribution {
  return {
    source: params.get('source') || undefined,
    campaign: params.get('campaign') || undefined,
    ref: params.get('ref') || undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
  };
}

export function getWhopCheckout(product: CommerceProduct) {
  const config = WHOP_PUBLIC_CONFIG[product];
  if (!config.planId || !config.checkoutUrl) return { configured: false as const };
  try {
    const url = new URL(config.checkoutUrl);
    if (url.protocol !== 'https:') return { configured: false as const };
    return { configured: true as const, planId: config.planId, checkoutUrl: url.toString() };
  } catch {
    return { configured: false as const };
  }
}

export function serializeAttribution(attribution: CheckoutAttribution) {
  return JSON.stringify(Object.fromEntries(Object.entries(attribution).filter(([, value]) => value)));
}
