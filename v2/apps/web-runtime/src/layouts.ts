import React from 'react';
import type { Session } from './auth.js';
import { adminPaths, customerPaths, publicPaths } from './router.js';

function nav(paths: string[]) { return React.createElement('nav', null, paths.map(path => React.createElement('a', { href: path, key: path }, path === '/' ? 'Home' : path.split('/').filter(Boolean).at(-1)))); }
export function AppShell({ path, session, children }: { path: string; session: Session; children?: React.ReactNode }) {
  const paths = path.startsWith('/admin') ? adminPaths : path.startsWith('/app') ? customerPaths : publicPaths;
  return React.createElement('div', { className: `hashibot-shell role-${session.role}` }, React.createElement('header', null, React.createElement('strong', null, '⚡ HashiBot V2'), React.createElement('span', null, `Session: ${session.role}`)), nav(paths), children, React.createElement('footer', null, 'V2 Platform API boundary • no root app clients • no direct exchange calls'));
}
