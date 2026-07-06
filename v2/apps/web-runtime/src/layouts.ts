import React from 'react';
import type { Session } from './auth.js';
import { adminPaths, customerPaths, publicPaths } from './router.js';

const labelFor = (path: string) => path === '/' ? 'Home' : path.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ').replace(/^\w/, c => c.toUpperCase()) ?? path;
function nav(paths: string[], active: string, compact = false) { return React.createElement('nav', { className: compact ? 'hb-mobile-nav' : 'hb-nav' }, paths.map(path => React.createElement('a', { href: path, key: path, className: active === path ? 'active' : undefined }, labelFor(path)))); }
export function AppShell({ path, session, children }: { path: string; session: Session; children?: React.ReactNode }) {
  const kind = path.startsWith('/admin') ? 'admin' : path.startsWith('/app') ? 'customer' : 'public';
  const paths = kind === 'admin' ? adminPaths : kind === 'customer' ? customerPaths : publicPaths;
  return React.createElement('div', { className: `hashibot-shell hb-shell-${kind} role-${session.role}` },
    React.createElement('header', { className: 'hb-topbar' }, React.createElement('a', { href: '/', className: 'hb-brand' }, React.createElement('span', { className: 'hb-logo' }, '⚡'), React.createElement('strong', null, 'HashiBot'), React.createElement('em', null, 'V2')), React.createElement('div', { className: 'hb-session' }, React.createElement('span', null, session.role.replaceAll('_', ' ')))) ,
    kind === 'public' ? nav(paths, path) : React.createElement('aside', { className: 'hb-sidebar' }, React.createElement('div', { className: 'hb-sidebar-title' }, kind === 'admin' ? 'Operator Console' : 'Customer Portal'), nav(paths, path)),
    React.createElement('div', { className: 'hb-content' }, children),
    kind !== 'public' ? nav(paths.slice(0, 5), path, true) : null,
    React.createElement('footer', { className: 'hb-footer' }, 'V2 Platform API boundary • no root app clients • no direct exchange calls'));
}
