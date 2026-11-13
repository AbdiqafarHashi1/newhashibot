import { test, expect } from '@playwright/test';
// Explicit network-failure checks must reach the routed request, not an installed PWA worker.
test.use({serviceWorkers:'block'});

test('public pages present the product and measured historical strategy studies',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:/Scan markets. Qualify opportunities./})).toBeVisible();await page.goto('/results');await expect(page.getByRole('heading',{name:'Historical strategy studies'})).toBeVisible();await expect(page.getByRole('table')).toContainText('Trend pullback');await expect(page.getByRole('table')).not.toContainText('80.9%');await expect(page.locator('tbody tr')).toHaveCount(10);await page.getByText('Monthly breakdown & research method',{exact:true}).click();await expect(page.getByText(/Research selection creates selection bias/)).toBeVisible();await page.goto('/ai-signals');await expect(page.getByRole('heading',{name:'Structured AI & Algorithmic Trading Signals'})).toBeVisible();expect(errors).toEqual([]);
});

test('admin research opens from primary navigation and keeps auth protection',async({page})=>{
  await page.route('**/*.supabase.co/**',route=>route.fulfill({status:503,json:{error:'Backend unavailable in this UI test'}}));
  await page.goto('/admin/research');await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');await page.evaluate(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
  await page.goto('/admin/launch');
  await expect(page.getByRole('heading',{name:'Your launch workspace',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible({timeout:20000});
  await expect(page.getByRole('region',{name:'Service journeys'}).getByRole('article')).toHaveCount(9);
  if(test.info().project.name==='phone')await page.getByRole('button',{name:'Open Navigation',exact:true}).click();
  await page.getByRole('link',{name:'Strategy research',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Strategies & research',exact:true})).toBeVisible();
  await expect(page.getByTestId('mission2-research-results')).toBeVisible();
  await page.getByLabel('Research experiment').selectOption({index:1});
  await expect(page.getByTestId('mission2-research-results')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
});

test('admin workspace opens current state without fictional customers or the preview banner',async({page})=>{
 await page.route('**/*.supabase.co/**',r=>r.fulfill({status:503,json:{error:'Backend unavailable in UI test'}}));await page.goto('/');await page.getByRole('button',{name:'Admin workspace',exact:true}).filter({visible:true}).first().click();await expect(page).toHaveURL(/\/admin\/launch$/);await expect(page.getByRole('heading',{name:'Your launch workspace',exact:true})).toBeVisible();await expect(page.getByLabel('Preview customer',{exact:true})).toHaveCount(0);await expect(page.getByText('OWNER PREVIEW — simulated data; no real actions.',{exact:true})).toHaveCount(0);await expect(page.locator('body')).not.toContainText('Amina');await expect(page.locator('body')).not.toContainText('Yusuf');
});

test('launch setup exposes the twelve tested configurations and their exact account periods',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 await page.route('**/*.supabase.co/**',route=>route.fulfill({status:503,json:{error:'Backend unavailable in UI test'}}));
 await page.goto('/admin/launch');
 const bundle=page.locator('section').filter({has:page.getByRole('heading',{name:'Enable tested strategies',exact:true})});
 await expect(bundle.getByRole('checkbox')).toHaveCount(12);
 await expect(bundle.getByRole('checkbox',{name:/^LTC range reversal/})).toBeVisible();
 await bundle.getByText('Inspect tested periods and account results',{exact:true}).click();
 const table=bundle.getByRole('table',{name:'Tested strategy account periods'});
 await expect(table.getByRole('row')).toHaveCount(25);
 await expect(table.getByRole('columnheader',{name:'Net return',exact:true})).toBeVisible();
 await expect(bundle.getByText(/not monthly returns or a combined portfolio result/)).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
