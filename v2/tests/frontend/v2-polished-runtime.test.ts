import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createSession, renderAppToHtml } from '../../apps/web-runtime/index.js';

const fakeClaims = /fake customers|fake balances|fake trades|fake signals|fake profits|fake Telegram deliveries|fake monitoring|fake performance stats|fake testimonials|lorem ipsum|guaranteed profit|P\/L sample/i;

test('live browser render is polished HTML instead of raw descriptor output', () => {
  const html = renderAppToHtml({ path: '/' });
  assert.match(html, /hb-hero/);
  assert.match(html, /hb-card/);
  assert.match(html, /hb-button/);
  assert.doesNotMatch(html, /component&quot;|searchFilterReady|raw descriptor/i);
});

test('public, customer, admin, and V2-specific feature pages render styled empty-safe UI', () => {
  const cases = [
    ['/', createSession('visitor'), /hb-hero|Create account/],
    ['/pricing', createSession('visitor'), /hb-card|pricing/i],
    ['/app/dashboard', createSession('approved_customer'), /customer-page|hb-metric|hb-empty/],
    ['/admin/dashboard', createSession('admin'), /admin-page|Operator actions|Operations center ready/],
    ['/admin/trade-truth', createSession('admin'), /Trade Truth|Protection Center|hb-empty/],
    ['/admin/command-queue', createSession('admin'), /Command Queue|No runtime activity/],
    ['/admin/research', createSession('admin'), /Research Lab|Certification gate/],
    ['/admin/hashibridge', createSession('admin'), /HashiBridge|No exchange connections yet/],
    ['/admin/deployment-status', createSession('admin'), /Deployment Status|Safe settings only/],
    ['/admin/environment-status', createSession('admin'), /Environment Status|Safe settings only/],
    ['/admin/platform-reset', createSession('admin'), /Dangerous owner-only action/]
  ] as const;
  for (const [path, session, expected] of cases) {
    const html = renderAppToHtml({ path, session });
    assert.match(html, expected, path);
    assert.doesNotMatch(html, fakeClaims, path);
  }
});

test('Netlify publishes built runtime dist and build creates index plus assets', () => {
  const netlify = readFileSync('netlify.toml', 'utf8');
  assert.match(netlify, /publish\s*=\s*"apps\/web-runtime\/dist"/);
  execSync('npm run build', { cwd: '.', stdio: 'pipe' });
  assert.ok(existsSync('apps/web-runtime/dist/index.html'));
  assert.ok(existsSync('apps/web-runtime/dist/assets'));
});
