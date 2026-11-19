import {test,expect,type Page} from '@playwright/test';
import { EXPECTED_SUPABASE_PROJECT_REF } from '../../src/lib/supabaseEnv';

// Exercise the real auth/profile gate with intercepted Supabase responses.
// Owner preview deliberately cannot establish an authenticated Admin identity.
async function authenticatedLab(page: Page, role = 'admin') {
 const id = '22222222-2222-4222-8222-222222222222';
 const user = { id, aud: 'authenticated', role: 'authenticated', email: 'lab@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
 await page.addInitScript(({ref,user}) => {
  const payload = btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 }));
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: `e30.${payload}.fixture`, refresh_token: 'browser-fixture', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user }));
 }, {ref: EXPECTED_SUPABASE_PROJECT_REF,user});
 await page.route('**/*.supabase.co/**',route=>{
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/auth/v1/user')) return route.fulfill({json:user});
  if (path.endsWith('/profiles')) return route.fulfill({json:{...user,full_name:'Lab Admin',role}});
  return route.fulfill({json:[]});
 });
}

test('Backtest Lab distinguishes canonical policy verification from legacy research without inventing results',async({page})=>{
 await authenticatedLab(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin/backtest?workspace=SCANNER');
 const panel=page.getByTestId('mission2-policy-replay');
 await expect(panel.getByRole('heading',{name:'Mission 1 entry policy verification'})).toBeVisible();
 await expect(panel.getByRole('button',{name:'Verify selected campaign'})).toBeDisabled();
 await expect(panel.getByRole('button',{name:'Resume saved run'})).toBeDisabled();
 await expect(panel.getByRole('button',{name:'Pause',exact:true})).toBeDisabled();
 await expect(panel.getByText('Choose a cached campaign in Market data first.')).toBeVisible();
 await expect(page.getByText(/The legacy server replay uses its older entry policy/)).toBeVisible();
 await expect(panel.getByText(/confirmed events/)).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});
test('Backtest Lab decodes genuine research evidence, switches account scenarios and shows frequency without claiming qualification',async({page})=>{
 await authenticatedLab(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin/backtest?workspace=SCANNER');
 const panel=page.getByTestId('mission2-research-results');await expect(panel.getByRole('heading',{name:'Strategy results & signal frequency'})).toBeVisible();
 await expect(panel.getByText(/No strategy has been promoted/)).toBeVisible();await expect(panel.getByRole('img',{name:'Historical account equity curve'})).toBeVisible();
 await panel.getByText('Whole-portfolio daily and weekly signal/execution frequency',{exact:true}).click();await expect(panel.getByText('2025-01-20',{exact:true})).toBeVisible();
 await panel.getByLabel('Research account scenario').selectOption('5');await expect(panel.getByText(/Whole-account scenario:/)).toContainText('entries');
 await panel.getByText(/All 30 strategy definitions/).click();await expect(panel.getByText(/forex.cost-aware-hourly/).first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});

test('authenticated Admin opens the browser ledger lab and downloads the saved source', async ({page}) => {
 await authenticatedLab(page);
 await page.goto('/admin/backtest');
 await expect(page.getByRole('heading', {name:'Backtest Lab',exact:true})).toBeVisible();
 const source = page.getByRole('button', {name:'Download Source CSV',exact:true});
 await expect(source).toBeEnabled();
 const download = page.waitForEvent('download');
 await source.click();
 expect((await download).suggestedFilename()).toMatch(/\.csv$/);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

for (const role of ['user', 'owner']) {
 test(`${role} profile cannot open either Backtest workspace or CSV tools`, async ({page}) => {
  await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
  await authenticatedLab(page, role);
  for (const path of ['/admin/backtest', '/admin/backtest?workspace=SCANNER']) {
   await page.goto(path);
   await expect(page).not.toHaveURL(/\/admin\/backtest/);
   await expect(page.getByRole('button', {name:'Download Source CSV',exact:true})).toHaveCount(0);
   await expect(page.getByTestId('mission2-policy-replay')).toHaveCount(0);
  }
 });
}

test('temporary Admin workspace runs saved research and CSV tools while Supabase is paused', async ({page}) => {
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 await page.route('**/*.supabase.co/**',route=>route.fulfill({status:503,json:{error:'Supabase paused'}}));
 const onlineReads: string[] = [];
 page.on('request',r=>{if (/validation_(runs|outcomes)/.test(r.url())) onlineReads.push(r.url());});
 await page.goto('/admin/backtest');
 await expect(page.getByRole('heading',{name:'Backtest Lab',exact:true})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'1,159 Trades'})).toBeVisible();
 await page.getByLabel('Trade source', {exact:true}).selectOption('ONLINE');
 await expect(page.getByText(/Admin workspace is offline/)).toBeVisible();
 expect(onlineReads).toEqual([]);
 const sourceDownload = page.waitForEvent('download');
 await page.getByRole('button',{name:'Download Source CSV',exact:true}).click();
 expect((await sourceDownload).suggestedFilename()).toMatch(/source-trades\.csv$/);
 await page.getByRole('button',{name:'Run browser comparison',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Net return',exact:true})).toBeVisible();
 const resultDownload = page.waitForEvent('download');
 await page.getByRole('button',{name:'Download Results CSV',exact:true}).click();
 expect((await resultDownload).suggestedFilename()).toMatch(/backtest-results\.csv$/);
 await page.getByRole('button',{name:'Server research workspace →',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Backtest workflow'})).toBeVisible();
});

test('Backtest still requires login without the explicit temporary Admin workspace', async ({page}) => {
 await page.route('**/*.supabase.co/**',route=>route.fulfill({json:[]}));
 await page.goto('/admin/backtest');
 await expect(page).toHaveURL(/\/login$/);
});
