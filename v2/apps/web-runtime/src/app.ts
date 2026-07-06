import React from 'react';
import { renderToString } from 'react-dom/server';
import { createV2PlatformApiClient } from './api-client.js';
import { createSession, type Session } from './auth.js';
import { AppShell } from './layouts.js';
import { RouteView } from './router.js';
import { runtimeCss } from './styles.js';

export type RenderOptions = { path?: string; session?: Session; api?: ReturnType<typeof createV2PlatformApiClient> };
export function HashiBotV2App({ path = '/', session = createSession('visitor'), api = createV2PlatformApiClient() }: RenderOptions) {
  return React.createElement(AppShell, { path, session }, React.createElement(RouteView, { path, session, api }));
}
export function renderAppToHtml(options: RenderOptions = {}) { const body = renderToString(React.createElement(HashiBotV2App, options)); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HashiBot V2</title><link rel="icon" href="/favicon.svg"><style>${runtimeCss}</style></head><body>${body}</body></html>`; }
export { createV2PlatformApiClient } from './api-client.js';
export { createSession, guardRoute, redirectAfterLogin } from './auth.js';
export { formsFor } from './pages.js';
export { publicPaths, customerPaths, adminPaths, allRoutes, resolveRoute } from './router.js';
