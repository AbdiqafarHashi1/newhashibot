import { Package } from './types';

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
    description: 'Public preview and onboarding path before paid Signal Room or Bot access.',
    features: ['Public preview only', 'Create an account and choose a package', 'No full signal access', 'No Bot controls'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'Crypto Signal Room', slug: 'crypto_signal_room', price: 5000, price_kes: 5000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Monthly crypto Signal Mode dashboard access with manual Telegram Signal Room onboarding.',
    features: ['Crypto Signal Mode access', 'Active signals and signal history', 'Telegram onboarding/status', 'Package/access status'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_personal_bot', name: 'Crypto Personal Bot', slug: 'crypto_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Crypto Bot setup package. Signal Room is included; execution setup requires admin configuration.',
    features: ['Includes Crypto Signal Room', 'Bot setup/status tracking', 'Risk preset request: Conservative, Balanced, or Aggressive', 'No live execution until configured by admin'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_personal_bot', name: 'Forex MT5 Personal Bot', slug: 'forex_mt5_personal_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 3,
    description: 'Forex MT5 Bot setup package. Signal Mode is included; MT5 setup requires admin configuration.',
    features: ['Includes Signal Mode access', 'MT5 setup/status tracking', 'Risk preset request: Conservative, Balanced, or Aggressive', 'No broker execution from this app'],
    created_at: '', updated_at: '',
  },
  {
    id: 'forex_mt5_prop_bot', name: 'Forex MT5 Prop Bot', slug: 'forex_mt5_prop_bot', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 4,
    description: 'Prop-safe Forex MT5 Bot setup package. Signal Mode is included; admin setup is required.',
    features: ['Includes Signal Mode access', 'Prop-safe positioning guidance', 'Default risk preset: Conservative / Prop Safe', 'No guaranteed profit wording or fake execution'],
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
  if (BOT_PACKAGE_SLUGS.has(pkg.slug as PackageCapability)) return 'Setup required / Admin-enabled';
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
