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
    description: 'Instant platform tour. Explore HashiBot dashboard, terminal architecture, strategy metrics, and risk management framework.',
    features: ['Live terminal tour & dashboard access', 'Complete strategy qualification rules', 'Risk & capital management engine walkthrough', 'Telegram alert integration guide', 'Community onboarding channel'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'Crypto Signal Room', slug: 'crypto_signal_room', price: 5000, price_kes: 5000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Instant access to institutional AI signals across Binance & Bybit crypto futures with Telegram alerts.',
    features: ['Real-time institutional signal stream', 'Exact entry zones, invalidation SL, TP1 & TP2', 'VIP Telegram channel real-time push alerts', 'Deterministic setup quality scoring & grade audit', 'Transparent live outcome tracking'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_personal_bot', name: 'Crypto Personal Bot', slug: 'crypto_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Full-stack automated execution for personal Binance & Bybit accounts with active position protection.',
    features: ['Includes full Crypto Signal Room VIP access', 'Direct Binance & Bybit automated API order execution', 'Configurable risk % sizing & daily drawdown limits', 'Automated break-even trailing & TP scaling', '24/7 continuous trade protection engine'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_personal_bot', name: 'Forex MT5 Personal Bot', slug: 'forex_mt5_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 3,
    description: 'Automated MetaTrader 5 execution for personal forex broker accounts (IC Markets, Exness, Pepperstone).',
    features: ['Includes full Signal Room VIP access', 'Dedicated Windows MT5 daemon bridge integration', 'Multi-currency scanning (EURUSD, GBPUSD, XAUUSD, US30)', 'Sub-second order dispatch & atomic command lease', 'Automated position reconciliation & health telemetry'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_prop_bot', name: 'Forex MT5 Prop Bot', slug: 'forex_mt5_prop_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 4,
    description: 'Institutional MT5 execution specifically tuned for funded prop firm challenges (FTMO, FundedNext, MFF).',
    features: ['Includes full Signal Room VIP access', 'Strict prop firm daily & total drawdown safety locks', 'Conservative position sizing (0.25% – 0.75% per trade)', 'Prop evaluation challenge pass management', 'Zero-drift protection & trade reconciliation'],
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


export function priceLabel(pkg: Package) {
  if (pkg.price === 0) return { main: 'Free', period: pkg.duration_days ? `${pkg.duration_days}-day preview` : '' };
  if (BOT_PACKAGE_SLUGS.has(pkg.slug as PackageCapability)) return { main: '10,000 KES', period: '/month or $100/month' };
  const amount = pkg.price_kes ?? pkg.price;
  const period = pkg.billing_period === 'monthly' || pkg.duration_days === 30 ? `/month` : '';
  return { main: pkg.currency === 'KES' ? `${Number(amount).toLocaleString()} KES` : `${pkg.currency} ${Number(amount).toLocaleString()}`, period };
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

