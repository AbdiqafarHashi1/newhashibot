import { Package } from './types.js';

export type PackageCapability = 'free_preview' | 'crypto_signal_room' | 'crypto_personal_bot' | 'forex_mt5_personal_bot' | 'forex_mt5_prop_bot';

export const PACKAGE_SLUGS: PackageCapability[] = [
  'free_preview',
  'crypto_signal_room',
  'crypto_personal_bot',
  'forex_mt5_personal_bot',
  'forex_mt5_prop_bot',
];

export const BOT_PACKAGE_SLUGS = new Set<PackageCapability>([
  'crypto_personal_bot',
  'forex_mt5_personal_bot',
  'forex_mt5_prop_bot',
]);

export const SIGNAL_INCLUDED_SLUGS = new Set<PackageCapability>([
  'crypto_signal_room',
  'crypto_personal_bot',
  'forex_mt5_personal_bot',
  'forex_mt5_prop_bot',
]);

export const PUBLIC_PACKAGES: Package[] = [
  {
    id: 'free_preview', name: 'Free Preview', slug: 'free_preview', price: 0, price_kes: 0, currency: 'KES', billing_period: '7-day preview',
    duration_days: 7, active: true, telegram_access_required: false, sort_order: 0,
    description: 'Instant platform tour. Explore dashboard analytics, live signal stream previews, strategy metrics, and risk management architecture.',
    features: ['Live terminal tour & dashboard access', 'Complete strategy qualification rules', 'Risk & capital management engine walkthrough', 'Telegram alert integration guide', 'Community onboarding channel'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'VIP Signal Room (Forex & Crypto)', slug: 'crypto_signal_room', price: 29, price_kes: 3500, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Instant VIP signals for Forex (Gold/XAUUSD, EURUSD, GBPUSD) and Crypto (BTC, ETH, SOL) with exact Entry, SL & TP alerts.',
    features: ['Combined Forex (Gold/FX) & Crypto signals', 'Exact entry zones, invalidation SL, TP1 & TP2', 'VIP Telegram channel instant push alerts', 'Daily EAT Morning London & NY Market Pulse', '1,200 KES weekly trial option available', 'Deterministic setup quality scoring & grade audit'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_personal_bot', name: 'Personal Auto-Bot (MT5 & Crypto)', slug: 'forex_mt5_personal_bot', price: 65, price_kes: 8500, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Fully automated algorithmic execution on personal MetaTrader 5 brokers (Exness, IC Markets) and Binance/Bybit API accounts.',
    features: ['Includes full VIP Signal Room access', 'Dedicated Windows MT5 daemon bridge & Crypto API execution', '0.5% fixed risk calculation per trade', 'Automated break-even trailing & TP scaling', '24/7 continuous trade protection & trade reconciliation'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_prop_bot', name: 'Prop Pass Master (Funded Accounts)', slug: 'forex_mt5_prop_bot', price: 95, price_kes: 12500, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 3,
    description: 'Institutional MT5 execution specifically tuned for FTMO, FundedNext, and The5ers challenges with hard drawdown defense.',
    features: ['Includes full VIP Signals & Bot features', '4.5% Hard daily & total drawdown safety locks', 'Conservative position sizing (0.25% – 0.75% per trade)', 'High-impact news spread & slippage protection gateway', '1-on-1 Portfolio Advisor AI support & pass tracking'],
    created_at: '', updated_at: '',
  },
];


const PACKAGE_BY_SLUG = new Map(PUBLIC_PACKAGES.map(pkg => [pkg.slug, pkg]));

export function normalizePackage(pkg: Package): Package {
  const publicPackage = PACKAGE_BY_SLUG.get(pkg.slug);
  const features = Array.isArray(pkg.features) ? pkg.features : JSON.parse(String(pkg.features ?? '[]'));
  if (!publicPackage) return { ...pkg, features };
  return {
    ...pkg,
    ...publicPackage,
    id: pkg.id,
    created_at: pkg.created_at,
    updated_at: pkg.updated_at,
  };
}

export function packageDisplayName(slugOrName?: string | null) {
  if (!slugOrName) return 'No package';
  const bySlug = PACKAGE_BY_SLUG.get(slugOrName);
  if (bySlug) return bySlug.name;
  const byName = PUBLIC_PACKAGES.find(pkg => pkg.name.toLowerCase() === slugOrName.toLowerCase());
  return byName?.name ?? slugOrName.replace(/_/g, ' ');
}

export function isKnownPackageSlug(slug?: string | null): slug is PackageCapability {
  return Boolean(slug && PACKAGE_SLUGS.includes(slug as PackageCapability));
}

export function signalModeIncluded(slugOrName?: string | null) {
  if (!slugOrName) return false;
  const slug = slugFromPackageValue(slugOrName);
  if (!slug) {
    const lower = slugOrName.toLowerCase();
    return !lower.includes('free') && !lower.includes('preview');
  }
  return Boolean(SIGNAL_INCLUDED_SLUGS.has(slug));
}

export function isBotPackage(slugOrName?: string | null) {
  if (!slugOrName) return false;
  const slug = slugFromPackageValue(slugOrName);
  if (!slug) {
    const lower = slugOrName.toLowerCase();
    return lower.includes('bot');
  }
  return Boolean(BOT_PACKAGE_SLUGS.has(slug));
}

export function slugFromPackageValue(value?: string | null): PackageCapability | null {
  if (!value) return null;
  if (isKnownPackageSlug(value)) return value;
  const normalized = value.toLowerCase();
  return PUBLIC_PACKAGES.find(pkg => pkg.name.toLowerCase() === normalized)?.slug as PackageCapability | null ?? null;
}

export function packageStatusLabel(pkg: Package) {
  if (pkg.slug === 'crypto_signal_room') return 'Available Now';
  if (pkg.slug === 'forex_mt5_prop_bot') return 'Live & Ready';
  if (BOT_PACKAGE_SLUGS.has(pkg.slug as PackageCapability)) return 'Live & Ready';
  return 'Instant Access';
}


export function priceLabel(pkg: Package, currency: 'KES' | 'USD' = 'KES') {
  if (pkg.price === 0 || pkg.price_kes === 0) {
    return { main: 'Free', period: pkg.duration_days ? `${pkg.duration_days}-day preview` : '', usdEquivalent: '$0' };
  }
  
  if (pkg.slug === 'crypto_signal_room') {
    return {
      main: currency === 'USD' ? '$29 USD' : '3,500 KES',
      period: '/month (or 1,200 KES/week)',
      usdEquivalent: currency === 'KES' ? '~$29/mo' : '3,500 KES/mo',
    };
  }
  
  if (pkg.slug === 'forex_mt5_personal_bot' || pkg.slug === 'crypto_personal_bot') {
    return {
      main: currency === 'USD' ? '$65 USD' : '8,500 KES',
      period: '/month',
      usdEquivalent: currency === 'KES' ? '~$65/mo' : '8,500 KES/mo',
    };
  }
  
  if (pkg.slug === 'forex_mt5_prop_bot') {
    return {
      main: currency === 'USD' ? '$95 USD' : '12,500 KES',
      period: '/month',
      usdEquivalent: currency === 'KES' ? '~$95/mo' : '12,500 KES/mo',
    };
  }

  const amountKes = pkg.price_kes ?? pkg.price;
  const amountUsd = pkg.price;
  return {
    main: currency === 'USD' ? `$${Number(amountUsd).toLocaleString()} USD` : `${Number(amountKes).toLocaleString()} KES`,
    period: '/month',
    usdEquivalent: currency === 'KES' ? `~$${Number(amountUsd)}/mo` : `${Number(amountKes).toLocaleString()} KES/mo`,
  };
}

export function defaultRiskPreset(slug?: string | null) {
  return slug === 'forex_mt5_prop_bot' ? 'Conservative / Prop Safe' : 'Conservative';
}

export interface PackageEntitlements {
  signalAccess: boolean;
  cryptoExecution: boolean;
  mt5Personal: boolean;
  mt5Prop: boolean;
  canConfigureBot: boolean;
}

export function getEntitlementsForPackage(slugOrName?: string | null, isActive: boolean = true): PackageEntitlements {
  if (!isActive) {
    return {
      signalAccess: false,
      cryptoExecution: false,
      mt5Personal: false,
      mt5Prop: false,
      canConfigureBot: false,
    };
  }

  const slug = slugFromPackageValue(slugOrName);
  if (!slug || slug === 'free_preview') {
    return {
      signalAccess: false,
      cryptoExecution: false,
      mt5Personal: false,
      mt5Prop: false,
      canConfigureBot: false,
    };
  }

  return {
    signalAccess: true, // All active paid packages have signal access
    cryptoExecution: slug === 'crypto_personal_bot',
    mt5Personal: slug === 'forex_mt5_personal_bot',
    mt5Prop: slug === 'forex_mt5_prop_bot',
    canConfigureBot: isBotPackage(slug),
  };
}

