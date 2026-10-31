import { AccessRequest, CustomerSubscription, Package } from './types';
import { isBotPackage, packageDisplayName, signalModeIncluded, slugFromPackageValue } from './packages';

export type CustomerAccessState = 'active' | 'pending_payment' | 'pending_admin_approval' | 'pending' | 'expired' | 'rejected' | 'no_package' | 'suspended';

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export function formatPackagePrice(pkg?: Package | null, sub?: CustomerSubscription | null) {
  const currency = pkg?.currency || sub?.currency || 'KES';
  const slug = pkg?.slug || slugFromPackageValue(sub?.package_name);
  const amount = slug && isBotPackage(slug) ? 10000 : pkg?.price ?? sub?.amount_paid ?? null;
  if (amount == null) return currency === 'KES' ? '3,500 KES' : 'Contact admin';
  if (Number(amount) === 0) return 'Free';
  const main = currency === 'KES'
    ? `${Number(amount).toLocaleString()} KES`
    : `${currency} ${Number(amount).toLocaleString()}`;
  return slug && isBotPackage(slug) ? `${main} or $100` : main;
}

export function billingPeriod(pkg?: Package | null) {
  if (pkg?.billing_period) return pkg.billing_period;
  if (pkg?.duration_days === 30) return 'monthly';
  if (pkg?.duration_days === 7) return '7-day preview';
  if (pkg?.duration_days) return `${pkg.duration_days} days`;
  return 'contact admin';
}

export function getCustomerAccessState(sub?: CustomerSubscription | null, request?: AccessRequest | null): CustomerAccessState {
  const hasPackage = Boolean(sub?.package_name || sub?.package_id);
  const expiresAt = sub?.expires_at ? new Date(sub.expires_at).getTime() : null;
  const isPastExpiry = expiresAt !== null && expiresAt < Date.now();

  // If subscription is explicitly suspended
  if (hasPackage && sub?.access_status === 'suspended') return 'suspended';

  // If subscription has expired
  if (hasPackage && (sub?.access_status === 'expired' || sub?.payment_status === 'expired' || isPastExpiry)) return 'expired';

  // Server-projected owner grants are access, not verified provider payments.
  const authorized = sub?.payment_status === 'paid' && sub?.verified_commerce === true || sub?.product_slug === 'crypto_signal_room' && sub?.payment_status === 'manual_access' && sub?.manual_access === true;
  if (hasPackage && sub?.access_status === 'active' && authorized && expiresAt!==null && Number.isFinite(expiresAt) && expiresAt>Date.now()) {
    if (signalModeIncluded(sub?.product_slug ?? sub?.package_name)) {
      return 'active';
    }
  }

  // Handle access requests status
  if (request) {
    if (request.status === 'rejected') return 'rejected';
    if (request.status === 'pending_payment') return 'pending_payment';
    if (request.status === 'pending_admin_approval' || request.status === 'pending') return 'pending_admin_approval';
    if (request.status === 'approved' || request.status === 'converted_to_access') return 'pending';
    if (request.status === 'expired') return 'expired';
  }

  if (hasPackage) return 'pending';

  return 'no_package';
}

export function hasFullSignalAccess(sub?: CustomerSubscription | null, request?: AccessRequest | null) {
  return getCustomerAccessState(sub, request) === 'active';
}

export function accessStateLabel(state: CustomerAccessState) {
  const labels: Record<CustomerAccessState, string> = {
    active: 'Active',
    pending_payment: 'Pending payment',
    pending_admin_approval: 'Pending admin approval',
    pending: 'Pending approval',
    expired: 'Expired',
    rejected: 'Rejected',
    no_package: 'No package',
    suspended: 'Suspended',
  };
  return labels[state];
}

export function accessStateDescription(state: CustomerAccessState, packageValue?: string | null) {
  const packageName = packageDisplayName(packageValue);
  const descriptions: Record<CustomerAccessState, string> = {
    active: `Your ${packageName} access is active. VIP provides signals and Telegram access.`,
    pending_payment: `Your ${packageName} request is saved and waiting for payment details or admin payment confirmation.`,
    pending_admin_approval: `Your ${packageName} request/payment details are waiting for admin approval. Submit Telegram details while you wait.`,
    pending: `Your ${packageName} account or payment is waiting for admin approval. Submit Telegram details while you wait.`,
    expired: 'Your access has expired. Renew through Billing to restore VIP access after verified payment.',
    rejected: 'Your latest request was rejected. Review the admin note if provided and submit updated payment/contact details.',
    no_package: 'Choose VIP and complete a verified payment through Billing.',
    suspended: 'Your access has been suspended. Please contact the administrator for resolution.',
  };
  return descriptions[state];
}
