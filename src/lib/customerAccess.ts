import { CustomerSubscription, Package } from './types';

export type CustomerAccessState = 'active' | 'pending' | 'expired' | 'no_package';

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export function formatPackagePrice(pkg?: Package | null, sub?: CustomerSubscription | null) {
  const currency = pkg?.currency || sub?.currency || 'KES';
  const amount = pkg?.price ?? sub?.amount_paid ?? null;
  if (amount == null) return currency === 'KES' ? '5,000 KES' : 'Contact admin';
  if (Number(amount) === 0) return 'Free';
  return currency === 'KES'
    ? `${Number(amount).toLocaleString()} KES`
    : `${currency} ${Number(amount).toLocaleString()}`;
}

export function billingPeriod(pkg?: Package | null) {
  if (pkg?.billing_period) return pkg.billing_period;
  if (pkg?.duration_days === 30) return 'monthly';
  if (pkg?.duration_days === 7) return '7-day preview';
  if (pkg?.duration_days) return `${pkg.duration_days} days`;
  return 'contact admin';
}

export function getCustomerAccessState(sub?: CustomerSubscription | null): CustomerAccessState {
  if (!sub?.package_name && !sub?.package_id) return 'no_package';

  const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : null;
  const isPastExpiry = expiresAt !== null && expiresAt < Date.now();

  if (sub.access_status === 'expired' || sub.payment_status === 'expired' || isPastExpiry) return 'expired';

  if (sub.access_status === 'active' && sub.payment_status === 'paid') return 'active';

  return 'pending';
}

export function hasFullSignalAccess(sub?: CustomerSubscription | null) {
  return getCustomerAccessState(sub) === 'active';
}

export function accessStateLabel(state: CustomerAccessState) {
  const labels: Record<CustomerAccessState, string> = {
    active: 'Active',
    pending: 'Pending approval',
    expired: 'Expired',
    no_package: 'No package',
  };
  return labels[state];
}

export function accessStateDescription(state: CustomerAccessState) {
  const descriptions: Record<CustomerAccessState, string> = {
    active: 'Your Signal Room access is active. You can view active signals, history, and signal details.',
    pending: 'Your account or payment is waiting for admin approval. Submit Telegram details while you wait.',
    expired: 'Your access has expired. Renew manually with admin to unlock full signals again.',
    no_package: 'Choose Crypto Signal Room and contact admin for manual payment approval.',
  };
  return descriptions[state];
}
