import React from 'react';
import { guardRoute, type Session } from './auth.js';
import type { V2PlatformApiClient } from './api-client.js';
import { AdminPage, CustomerPage, PublicPage } from './pages.js';
import { ErrorState } from './components.js';
import { customerRoutes, publicRoutes } from '../../web-customer/index.js';
import { adminRoutes, legacyRouteAliases } from '../../web-admin/index.js';

export const publicPaths = publicRoutes.filter(r => r.path !== '/logout').map(r => r.path);
export const customerPaths = customerRoutes.map(r => r.path);
export const adminPaths = [...adminRoutes, ...legacyRouteAliases].map(r => r.path);
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
