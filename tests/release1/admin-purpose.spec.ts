import {test,expect} from '@playwright/test';
test('seven daily admin pages, advanced tools and canonical customer support',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 await page.route('**/*.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/profiles'))return route.fulfill({json:[{id:'22222222-2222-4222-8222-222222222222',email:'unlinked@example.test',full_name:'Unlinked customer'}]});
  if(path.endsWith('/phase-o-agents')){let b:any={};try{b=route.request().postDataJSON()}catch{/* read */}
   return route.fulfill({json:b.action==='TELEGRAM_MEMBERS'?{data:{links:[],hasMore:false}}:{state:'OK',data:{},sources:[]}});
  }
  return route.fulfill({json:[]});
 });
 await page.goto('/admin/customers');await expect(page.getByRole('heading',{name:'Customers & access',exact:true}).last()).toBeVisible();await expect(page.getByText('unlinked@example.test',{exact:true})).toBeVisible();
 if(test.info().project.name==='phone')await page.getByRole('button',{name:'Open Navigation',exact:true}).click();
 await expect(page.getByRole('link',{name:'Execution account readiness',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Show advanced tools'}).click();await expect(page.getByRole('link',{name:'Execution account readiness',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Hide advanced tools'}).click();await expect(page.getByRole('link',{name:'Execution account readiness',exact:true})).toHaveCount(0);
 if(test.info().project.name==='phone')await page.getByRole('button',{name:'Close navigation',exact:true}).click();
 await page.getByRole('button',{name:'Manage this customer'}).click();await expect(page.getByLabel('Manual VIP customer email')).toHaveValue('unlinked@example.test');await expect(page.getByRole('button',{name:'Grant 30-day VIP access'})).toHaveCount(1);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:`test-results/customer-access-${test.info().project.name}.png`,fullPage:true});
 for(const old of ['/admin/users','/admin/onboarding','/admin/access-requests']){await page.goto(old);await expect(page).toHaveURL(/\/admin\/customers$/);}
 await page.goto('/admin/telegram?tab=members');await expect(page.getByRole('button',{name:'Grant 30-day VIP access'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Customers & access →'})).toBeVisible();
 await page.goto('/admin/growth-goal?tab=payments');await expect(page.getByRole('heading',{name:'Payment connections',exact:true})).toHaveCount(0);
});
test('retired fictional customer preview cannot grant customer access',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','active'));
 await page.goto('/app/onboarding');await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole('heading',{name:'Finish your setup',exact:true})).toHaveCount(0);await expect(page.getByLabel('Preview customer')).toHaveCount(0);
});
