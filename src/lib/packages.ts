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
    description: 'Explore HashiBot before subscribing. View sample signal format, package options, risk guidance, and onboarding flow.',
    features: ['Public dashboard preview', 'Sample signal format', 'Package comparison', 'Telegram setup guide', 'No live signal access', 'No Bot controls'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'Crypto Signal Room', slug: 'crypto_signal_room', price: 5000, price_kes: 5000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Monthly crypto Signal Room access.',
    features: ['Active crypto signals', 'Active signal details', 'Telegram onboarding', 'Package status', 'Signal-only. No automated execution.'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_personal_bot', name: 'Crypto Personal Bot', slug: 'crypto_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Includes Crypto Signal Room. Managed crypto Bot setup for personal trading mode.',
    features: ['Includes Crypto Signal Room', 'Managed crypto Bot setup for personal trading mode', 'Risk preset collected during setup', 'Execution is activated only after setup and verification'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_personal_bot', name: 'Forex MT5 Personal Bot', slug: 'forex_mt5_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 3,
    description: 'Includes Signal Room. Managed MT5 forex Bot setup for personal trading mode.',
    features: ['Includes Signal Room', 'Managed MT5 forex Bot setup for personal trading mode', 'Risk preset collected during setup', 'MT5 connection is activated only after setup and verification'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_prop_bot', name: 'Forex MT5 Prop Bot', slug: 'forex_mt5_prop_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 4,
    description: 'Includes Signal Room. Managed MT5 forex Bot setup for prop-safe trading.',
    features: ['Includes Signal Room', 'Managed MT5 forex Bot setup for prop-safe trading', 'Conservative / Prop Safe risk profile', 'Built for rule protection and controlled risk'],
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
  const slug = slugFromPackageValue(slugOrName);
  return Boolean(slug && SIGNAL_INCLUDED_SLUGS.has(slug));
}

export function isBotPackage(slugOrName?: string | null) {
  const slug = slugFromPackageValue(slugOrName);
  return Boolean(slug && BOT_PACKAGE_SLUGS.has(slug));
}

export function slugFromPackageValue(value?: string | null): PackageCapability | null {
  if (!value) return null;
  if (isKnownPackageSlug(value)) return value;
  const normalized = value.toLowerCase();
  return PUBLIC_PACKAGES.find(pkg => pkg.name.toLowerCase() === normalized)?.slug as PackageCapability | null ?? null;
}

export function packageStatusLabel(pkg: Package) {
  if (pkg.slug === 'crypto_signal_room') return 'Available';
  if (pkg.slug === 'forex_mt5_prop_bot') return 'Prop-Safe Setup';
  if (BOT_PACKAGE_SLUGS.has(pkg.slug as PackageCapability)) return 'Managed Setup';
  return 'Preview';
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
