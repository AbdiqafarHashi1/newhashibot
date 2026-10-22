import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ownerPreviewRoutes } from '../../src/lib/ownerPreview/routes';
const banner = 'OWNER PREVIEW — simulated data; no real actions.';
async function enter(page: Page) {
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('owner-preview-preservation-test','real-local-preference'));
  await page.getByRole('button',{name:'Owner Preview',exact:true}).first().click();
  await expect(page.getByText(banner,{exact:true})).toBeVisible();
}
function audit(page: Page) {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173' || !['GET','HEAD'].includes(request.method()) || /^\/(api|functions|rest)\//.test(url.pathname)) requests.push(`${request.method()} ${url.href}`);
  });
  page.on('pageerror', error => errors.push(error.message));
  return { requests, errors };
}
async function navigate(page: Page, path: string) {
  // Exercise actual inventory links, preserving disposable fixture state.
  const menu = page.locator('details').filter({has:page.getByText('All implemented routes',{exact:true})});
  if (!(await menu.evaluate(element => (element as HTMLDetailsElement).open))) await menu.locator('summary').click();
  await page.getByRole('navigation',{name:'Preview route inventory'}).getByRole('link',{name:path,exact:true}).click();
  await page.waitForTimeout(150);
  await expect(page.getByText('HashiBot could not render this screen',{exact:true})).toHaveCount(0);
}

test('production entries, route inventory and auth guards', async ({page}, info) => {
  await page.goto('/');
  await expect(page.locator('footer').getByRole('button',{name:'Owner Preview',exact:true}).first()).toBeVisible();
  if(info.project.name==='phone') {
    await expect(page.getByRole('button',{name:'Owner Preview',exact:true}).first()).toBeVisible();
    await page.getByRole('button',{name:'Toggle Navigation Menu'}).click();
    await expect(page.locator('header').getByRole('button',{name:'Owner Preview',exact:true}).last()).toBeVisible();
  }
  await enter(page);
  const observed = audit(page);
  await page.evaluate(()=>localStorage.setItem('owner-preview-preservation-test','disposable-preview-change'));
  if(info.project.name==='phone') {
    await page.getByRole('button',{name:'Open Navigation',exact:true}).click();
    await page.getByRole('link',{name:'Scanner Configuration',exact:true}).click();
    await expect(page.getByRole('button',{name:'Save Config',exact:true})).toBeVisible();
  }
  for (const route of ownerPreviewRoutes) {
    await navigate(page,route);
    await expect(page.getByText(banner,{exact:true})).toBeVisible();
    await expect(page.locator('body')).not.toContainText('HashiBot could not render this screen');
  }
  expect(observed.errors).toEqual([]);
  expect(observed.requests).toEqual([]);
  await page.getByRole('button',{name:'Exit preview',exact:true}).click();
  await expect(page.getByText(banner,{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('owner-preview-preservation-test'))).toBe('real-local-preference');
  expect(await page.evaluate(()=>sessionStorage.getItem('hashibot.owner-preview.v1'))).toBeNull();
  await page.evaluate(()=>localStorage.setItem('hashibot_admin_bypass','true'));
  for(const path of ['/admin/mission-control','/admin/customers','/admin/backtest','/app/readiness']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('local actions, scoped customer journeys, network denial, reset and screenshots', async ({page}, info) => {
  await enter(page);
  const observed = audit(page);
  mkdirSync('docs/owner-preview/screenshots',{recursive:true});
  await page.screenshot({path:`docs/owner-preview/screenshots/${info.project.name}-operations.png`});
  await navigate(page,'/admin/mission-control');
  await page.getByRole('button',{name:/^Start HashiBot$/i}).first().click();
  await expect(page.locator('body')).toContainText('Disposable preview state updated');
  await navigate(page,'/admin/recovery');
  await page.getByRole('button',{name:'Execute Repair',exact:true}).first().click();
  await expect(page.locator('body')).toContainText('Repair sequence executed');
  await navigate(page,'/admin/commerce');
  await page.getByRole('button',{name:'Retry eligible work & reconcile',exact:true}).click();
  await expect(page.locator('body')).toContainText('Reconciliation accepted');
  await navigate(page,'/admin/scanner-config');
  await page.getByRole('button',{name:/Save Config/}).click();
  await navigate(page,'/admin/backtest');
  await page.getByRole('button',{name:/LOAD SIMULATED DEMONSTRATION DATA/i}).first().click();
  await expect(page.locator('body')).toContainText('SIMULATED: 600 illustrative candles');
  await page.getByRole('navigation',{name:'Backtest workflow'}).getByRole('button',{name:/Scanner pipeline/}).click();
  const simulations=page.getByRole('region',{name:'Connected validation operations'});
  await simulations.getByLabel('Complete datasets').selectOption('preview-dataset');
  await simulations.getByRole('button',{name:'Run full scanner pipeline',exact:true}).click();
  await expect(simulations).toContainText('COMPLETED');
  await simulations.getByRole('button',{name:'Inspect',exact:true}).last().click();
  await expect(simulations).toContainText('SIMULATED_DEMONSTRATION');
  await simulations.getByLabel('Validation mode',{exact:true}).selectOption('SHADOW');
  await simulations.getByRole('button',{name:'Start shadow observation',exact:true}).click();
  await expect(simulations).toContainText('RUNNING');
  await simulations.getByRole('button',{name:'Inspect',exact:true}).last().click();
  await simulations.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(simulations).toContainText('CANCELLED');
  await simulations.getByLabel('Validation mode',{exact:true}).selectOption('ACCOUNT');
  await simulations.getByLabel('Completed scanner run').selectOption('preview-replay-completed');
  await simulations.getByLabel('Account',{exact:true}).selectOption('preview-amina-mt5-personal');
  await simulations.getByLabel('Approved Brain').selectOption('preview-brain-preview-amina-mt5-personal');
  await simulations.getByRole('button',{name:'Run account simulation',exact:true}).click();
  await expect(simulations).toContainText('COMPLETED');
  await simulations.getByLabel('Validation mode',{exact:true}).selectOption('PROP');
  await simulations.getByLabel('Completed account run').selectOption('preview-account-completed');
  await simulations.getByLabel('Frozen profile').selectOption('preview-prop-profile');
  await simulations.getByRole('button',{name:'Run 100 Prop challenges',exact:true}).click();
  await expect(simulations).toContainText('COMPLETED');
  await navigate(page,'/app/onboarding');
  // Preview is deliberately not an authenticated Supabase customer.
  // Saving real onboarding requires a genuine identity; do not forge one for this test.
  await expect(page.getByRole('button',{name:'Save & continue',exact:true})).toBeDisabled();
  await navigate(page,'/app/readiness');
  await expect(page.locator('main').last()).toContainText('Amina');
  await expect(page.locator('main').last()).not.toContainText('Yusuf');
  await page.getByLabel('Preview customer').selectOption('preview-customer-yusuf');
  await expect(page.locator('main').last()).toContainText('Yusuf');
  await expect(page.locator('main').last()).not.toContainText('Amina');
  await page.getByLabel('Preview account').selectOption('preview-yusuf-bybit');
  await expect(page.getByRole('complementary',{name:'Owner Preview controls'})).toContainText('0.15% · blocked');
  const secrets = page.locator('[data-preview-credential]');
  expect(await secrets.count()).toBeGreaterThan(0);
  for(const input of await secrets.all()) { await expect(input).toBeDisabled(); await expect(input).toHaveValue(''); }
  if(info.project.name==='phone') await page.getByRole('heading',{name:'Execution accounts',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`docs/owner-preview/screenshots/${info.project.name}-customer.png`});
  const blocked = await page.evaluate(async()=>{
    const requests = ['/api/ai','https://example.supabase.co/functions/v1/admin-operator-action','https://api.binance.com/api/v3/order'];
    const results = await Promise.all(requests.map(url=>fetch(url,{method:'POST',body:'{}'}).then(()=>false,()=>true)));
    try { const xhr=new XMLHttpRequest();xhr.open('POST','/api/ai');xhr.send('{}');results.push(false); } catch { results.push(true); }
    results.push(navigator.sendBeacon('/api/ai','{}')===false);
    try { new WebSocket('wss://api.bybit.com');results.push(false); } catch { results.push(true); }
    try { new Worker('/worker.js');results.push(false); } catch { results.push(true); }
    return results;
  });
  expect(blocked.every(Boolean)).toBe(true);
  expect(observed.requests).toEqual([]);
  expect(observed.errors).toEqual([]);
  await page.getByRole('button',{name:'Reset demonstration data',exact:true}).click();
  await expect(page.getByLabel('Preview customer')).toHaveValue('preview-customer-amina');
  await navigate(page,'/app/onboarding');
  await expect(page.locator('body')).toContainText('Step 1 of 13');
  await expect(page.getByRole('button',{name:'Save & continue',exact:true})).toBeDisabled();
  expect(observed.requests).toEqual([]);
  expect(observed.errors).toEqual([]);
});
