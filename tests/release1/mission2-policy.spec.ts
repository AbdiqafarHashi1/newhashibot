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
