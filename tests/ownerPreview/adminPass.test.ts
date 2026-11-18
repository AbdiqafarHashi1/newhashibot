import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Admin workspace opens current state without establishing backend authentication', async () => {
  const values = new Map<string, string>();
  const redirects: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    sessionStorage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) },
    location: { assign: (p: string) => redirects.push(p), replace: (p: string) => redirects.push(p), reload() {} },
  } });
  try {
    const state = await import('../../src/lib/ownerPreview/state');
    state.enterOwnerPreview();
    assert.equal(state.isAdminPass(), true);
    assert.equal(state.isOwnerPreview(), false);
    assert.equal(redirects[0], '/admin/launch');
    state.exitOwnerPreview();
    assert.equal(state.isAdminPass(), false);
    assert.equal(redirects[1], '/');
  } finally { Reflect.deleteProperty(globalThis, 'window'); }
});
