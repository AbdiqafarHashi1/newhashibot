import {test,expect} from '@playwright/test';
test('Backtest Lab distinguishes canonical policy verification from legacy research without inventing results',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 await page.route('**/*.supabase.co/**',route=>route.fulfill({json:[]}));
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
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 await page.route('**/*.supabase.co/**',route=>route.fulfill({json:[]}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/admin/backtest?workspace=SCANNER');
 const panel=page.getByTestId('mission2-research-results');await expect(panel.getByRole('heading',{name:'Strategy results & signal frequency'})).toBeVisible();
 await expect(panel.getByText(/No strategy has been promoted/)).toBeVisible();await expect(panel.getByRole('img',{name:'Historical account equity curve'})).toBeVisible();
 await panel.getByText('Whole-portfolio daily and weekly signal/execution frequency',{exact:true}).click();await expect(panel.getByText('2025-01-20',{exact:true})).toBeVisible();
 await panel.getByLabel('Research account scenario').selectOption('5');await expect(panel.getByText(/Whole-account scenario:/)).toContainText('entries');
 await panel.getByText(/All 30 strategy definitions/).click();await expect(panel.getByText(/forex.cost-aware-hourly/).first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
