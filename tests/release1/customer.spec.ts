import {test,expect} from '@playwright/test';
test('Free → VIP → authentication and recovery surfaces',async({page})=>{
 await page.route('**/*.supabase.co/**',route=>route.abort());
 for(const route of ['/','/free','/vip','/pricing','/login','/signup','/payment/result']){
  await page.goto(route);await expect(page.locator('body')).not.toBeEmpty();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await expect(page.locator('body')).not.toContainText('0712482447');
 }
 await page.goto('/pricing');await expect(page).toHaveURL(/\/vip$/);await expect(page.locator('body')).toContainText('3,500');await expect(page.locator('body')).toContainText('29');await expect(page.locator('body')).toContainText('verification');
 await page.goto('/free');await page.getByRole('button',{name:'Join Free Telegram',exact:true}).first().click();await expect(page).toHaveURL(/\/login/);
 await page.goto('/payment/result');await expect(page).toHaveURL(/\/login/);await expect(page.locator('body')).not.toContainText('Payment verified');
});
