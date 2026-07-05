import React from 'react';
import { guardRoute, type Session } from './auth.js';
import type { V2PlatformApiClient } from './api-client.js';
import { AdminPage, CustomerPage, PublicPage } from './pages.js';
import { ErrorState } from './components.js';

export const publicPaths = ['/', '/features', '/pricing', '/results', '/how-it-works', '/faq', '/mpesa', '/affiliate/exness', '/login', '/register'];
export const customerPaths = ['/app/pending', '/app/suspended', '/app/expired', '/app/dashboard', '/app/billing', '/app/accounts', '/app/executors', '/app/signals', '/app/trades', '/app/risk-profile', '/app/strategies', '/app/telegram', '/app/settings', '/app/support'];
export const adminPaths = ['/admin/dashboard', '/admin/customers', '/admin/approvals', '/admin/subscriptions', '/admin/mpesa', '/admin/packages', '/admin/accounts', '/admin/executors', '/admin/executors/detail', '/admin/signals', '/admin/trades', '/admin/telegram', '/admin/telegram/queue', '/admin/runtime', '/admin/monitoring', '/admin/protection', '/admin/recovery', '/admin/notifications', '/admin/audit-logs', '/admin/system-settings'];
export const allRoutes = [...publicPaths, ...customerPaths, ...adminPaths];

export function resolveRoute(path: string, session: Session) {
  const guard = guardRoute(path, session);
  if (!guard.allowed) return { path: guard.redirect ?? '/login', redirectedFrom: path, reason: guard.reason };
  return { path };
}

export function RouteView({ path, session, api }: { path: string; session: Session; api: V2PlatformApiClient }) {
  const route = resolveRoute(path, session);
  if (route.path.startsWith('/admin')) return React.createElement(AdminPage, { path: route.path, session, api });
  if (route.path.startsWith('/app')) return React.createElement(CustomerPage, { path: route.path, session, api });
  if (publicPaths.includes(route.path)) return React.createElement(PublicPage, { path: route.path, session, api });
  return React.createElement(ErrorState, { message: `Route not found: ${path}` });
}
