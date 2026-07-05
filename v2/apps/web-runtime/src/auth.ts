export type AuthRole = 'visitor' | 'pending_customer' | 'approved_customer' | 'suspended_customer' | 'expired_customer' | 'admin' | 'owner';
export type Session = { role: AuthRole; email?: string; displayName?: string };
export type GuardResult = { allowed: boolean; redirect?: string; reason?: string };

export function createSession(role: AuthRole = 'visitor', email?: string): Session { return { role, email, displayName: email?.split('@')[0] ?? 'Guest' }; }
export function isAdminRole(role: AuthRole) { return role === 'admin' || role === 'owner'; }
export function isCustomerRole(role: AuthRole) { return role.endsWith('_customer'); }

export function redirectAfterLogin(session: Session) {
  if (isAdminRole(session.role)) return '/admin/dashboard';
  if (session.role === 'approved_customer') return '/app/dashboard';
  if (session.role === 'pending_customer') return '/app/pending';
  if (session.role === 'suspended_customer') return '/app/suspended';
  if (session.role === 'expired_customer') return '/app/expired';
  return '/login';
}

export function guardRoute(path: string, session: Session): GuardResult {
  if (path.startsWith('/admin')) return isAdminRole(session.role) ? { allowed: true } : { allowed: false, redirect: '/login', reason: 'admin-required' };
  if (path.startsWith('/app')) {
    if (session.role === 'approved_customer') return { allowed: true };
    if (session.role === 'pending_customer') return path === '/app/pending' ? { allowed: true } : { allowed: false, redirect: '/app/pending', reason: 'pending-approval' };
    if (session.role === 'suspended_customer') return path === '/app/suspended' ? { allowed: true } : { allowed: false, redirect: '/app/suspended', reason: 'suspended' };
    if (session.role === 'expired_customer') return path === '/app/expired' ? { allowed: true } : { allowed: false, redirect: '/app/expired', reason: 'expired' };
    return { allowed: false, redirect: '/login', reason: 'customer-required' };
  }
  return { allowed: true };
}
