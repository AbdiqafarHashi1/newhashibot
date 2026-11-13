import { isOwnerPreview } from './state';
import { previewStore } from './adapter';

export const blockedPreviewRequests: string[] = [];
export function permitsPreviewRequest(input: string, method: string, origin: string) {
  const url = new URL(input, origin);
  // Only application assets and published immutable research files. No API access.
  return method.toUpperCase() === 'GET' && url.origin === origin
    && (/^\/(assets|src|node_modules)\//.test(url.pathname)
      || url.pathname === '/research/prop-ftmo-swing-20261113.summary.json'
      || /^\/research\/mission2-[a-zA-Z0-9-]+\.json$/.test(url.pathname)
      || /^\/(?:@vite\/client|@react-refresh|favicon\.ico)$/.test(url.pathname));
}

/** Installed before importing the app. A preview starts/ends with a full document load. */
export function installPreviewIsolation() {
  if (!isOwnerPreview()) return;
  document.documentElement.setAttribute('data-owner-preview', 'true');
  const deny = (url: string): never => {
    blockedPreviewRequests.push(url);
    throw new Error('OWNER_PREVIEW_EXTERNAL_ACTION_BLOCKED — no real actions');
  };
  const fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (!permitsPreviewRequest(url, method, window.location.origin)) { blockedPreviewRequests.push(url); return Promise.reject(new Error('OWNER_PREVIEW_EXTERNAL_ACTION_BLOCKED')); }
    return fetch(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (!permitsPreviewRequest(String(url), method, location.origin)) deny(String(url));
    return Reflect.apply(open, this, [method, url, ...rest]);
  } as typeof open;
  navigator.sendBeacon = url => { blockedPreviewRequests.push(String(url)); return false; };
  const Socket = window.WebSocket;
  window.WebSocket = new Proxy(Socket, { construct(target, args) {
    const url = new URL(String(args[0]), location.href);
    // Vite HMR is local development tooling, never a provider socket.
    if (!import.meta.env.DEV || url.host !== location.host) deny(url.href);
    return Reflect.construct(target, args);
  }});
  window.Worker = new Proxy(window.Worker, { construct(_target, args) { return deny(String(args[0])); } });
  window.EventSource = new Proxy(window.EventSource, { construct(_target, args) { return deny(String(args[0])); } });

  // Preview preferences and locks must never overwrite real local storage.
  const memory = new Map<string, string>();
  const keyFor = (key: string) => `${previewStore.customer().id}:${key}`;
  Storage.prototype.getItem = key => memory.get(keyFor(key)) ?? null;
  Storage.prototype.setItem = (key, value) => { memory.set(keyFor(key), String(value)); };
  Storage.prototype.removeItem = key => { memory.delete(keyFor(key)); };
  Storage.prototype.clear = () => memory.clear();
  Storage.prototype.key = index => [...memory.keys()][index] ?? null;
  // Existing research caches belong to real workflows, not disposable demonstrations.
  window.indexedDB.open = () => deny('indexedDB: preview uses disposable memory only');
  window.indexedDB.deleteDatabase = () => deny('indexedDB: real caches are preserved');
  // Block resource loads, embedded checkouts, form navigation and worker escape paths.
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'none'; object-src 'none'; form-action 'none'; worker-src 'none'; base-uri 'self'";
  document.head.append(policy);
  document.addEventListener('click', event => {
    const anchor = (event.target as Element)?.closest?.('a');
    if (anchor && !anchor.download && new URL(anchor.href, location.href).origin !== location.origin) {
      event.preventDefault();
      alert('Owner Preview: external destinations are disabled.');
    }
  }, true);
}
installPreviewIsolation();
