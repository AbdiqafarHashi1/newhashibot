import { test, expect } from '@playwright/test';
// Explicit network-failure checks must reach the routed request, not an installed PWA worker.
test.use({serviceWorkers:'block'});

test('public research preserves losing results, filters and failure recovery',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/See the setup/})).toBeVisible();
  await expect(page.getByText('Binance & Bybit Live',{exact:true})).toHaveCount(0);
  await page.goto('/results');
  await expect(page.getByRole('heading',{name:'Historical comparisons'})).toBeVisible();
  await expect(page.getByRole('table')).toContainText('-5.94%');
  await expect(page.getByRole('table')).not.toContainText('80.9%');
  await page.getByLabel('Results entry method').selectOption('CONDITIONAL_ONLY');
  const bodyRows=page.locator('tbody tr');expect(await bodyRows.count()).toBeGreaterThan(0);
  for(const row of await bodyRows.all())await expect(row).toContainText('Conditional only');
  await page.route('**/research/mission2-results.json',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.reload();await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await page.unroute('**/research/mission2-results.json');await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.goto('/ai-signals');await expect(page.getByRole('heading',{name:'Conditional watch',exact:true})).toBeVisible();
  await expect(page.getByText('Verified Status: TP1 Hit (+1.75% R)',{exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
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
