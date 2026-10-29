import {test,expect} from '@playwright/test';
// Presentation-only admin shell plus intercepted API fixtures. This grants no backend authorization.
test('Telegram and Growth hubs: routes, channel controls, two goals and unavailable-state honesty',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('hashibot.owner-preview.v1','admin-shell'));
 const channels=['FREE','VIP_CRYPTO','VIP_FOREX_GOLD','ADMIN'].map((audience,i)=>({audience,chat_id:`-100${i}`,enabled:true,verified_at:'2026-10-29T10:00:00Z',source:'DATABASE',legacy_hint:''}));
 const actions:Record<string,unknown>[]=[];let unavailable=false;
 await page.route('**/*.supabase.co/**',async route=>{const url=new URL(route.request().url());let body:Record<string,unknown>={};try{body=route.request().postDataJSON()??{};}catch{/* GET */}
  if(url.pathname.endsWith('/phase-o-agents')){actions.push(body);const action=body.action;let value:unknown={state:'OK'};
   if(action==='TELEGRAM_OVERVIEW')value={state:'OK',data:{channels,secrets:{bot:true,webhook:true,membershipWorker:true,agentWorker:true,ai:false},health:[],observedAt:'2026-10-29T10:00:00Z'}};
   if(action==='GROWTH_OVERVIEW'){if(unavailable)return route.fulfill({status:503,json:{error:'BACKEND_UNAVAILABLE'}});value={state:'OK',data:{vip_target:1000,free_target:1000,paid_customers:1201,free_customers:1300,confirmed_free_members:1100,confirmed_vip_members:12,both_vip_channels:10,paid_without_telegram_link:2,pending_fulfillment:0,agent_queue:3,awaiting_approval:1,uncertain_deliveries:0,active_campaigns:2,vip_expiring_7d:4,observed_at:'2026-10-29T10:00:00Z',funnel:{landing_visits:2000,signups:300,checkouts:50,renewals:10,churned:2}}};}
   if(action==='LIST')value={state:'OK',data:{phase_o_agent_configurations:[],phase_o_destinations:[],phase_o_campaigns:[],phase_o_agent_jobs:[],phase_o_drafts:[],phase_o_delivery_parts:[]}};
   if(action==='EVIDENCE_OPTIONS')value={state:'OK',sources:[]};
   if(action==='TELEGRAM_MEMBERS')value={state:'OK',data:{links:[],hasMore:false}};
   if(action==='SAVE_CHANNEL'){const c=channels.find(c=>c.audience===body.audience)!;c.chat_id=String(body.chat_id);c.enabled=false;value={state:'SAVED_VERIFY_REQUIRED'};}
   if(action==='VERIFY_CHANNEL'){channels.find(c=>c.audience===body.audience)!.enabled=true;value={state:'VERIFIED_ENABLED'};}
   if(action==='TEST_CHANNEL')value={state:'SENT',data:{messageId:'fixture-message-1'}};
   return route.fulfill({json:value});
  }
  if(url.pathname.endsWith('/watched_strategy_coverage'))return route.fulfill({json:{strategies:[{strategy_id:'crypto.micro-scalper',version:'1.0.0',checked_at:new Date().toISOString(),streams:20,watches:0,held:1,no_setup:19,disabled:0,timeframes:['5m','15m'],supported_timeframes:['5m','15m']},{strategy_id:'forex.micro-scalper',version:'1.0.0',checked_at:new Date().toISOString(),streams:10,watches:0,held:0,no_setup:10,disabled:0,timeframes:['5m','15m'],supported_timeframes:['5m','15m']},{strategy_id:'crypto.regime-channel-breakout',version:'1.0.0',checked_at:new Date().toISOString(),streams:20,watches:0,held:0,no_setup:0,disabled:20,timeframes:['5m','15m'],supported_timeframes:['4h']}]}});
  if(url.pathname.endsWith('/conditional_asset_watch'))return route.fulfill({json:['BTCUSDT','EURUSD'].flatMap(symbol=>['15m','1h'].map(timeframe=>({symbol,timeframe,market:symbol==='BTCUSDT'?'crypto':'forex',state:'HEALTHY',checked_at:new Date().toISOString(),last_closed_at:'2026-10-29T10:00:00Z',error:null})))});
  if(url.pathname.endsWith('/conditional_service_overview'))return route.fulfill({json:{tracks:[],scope:'fixture cohort'}});
  if(url.pathname.endsWith('/admin-scheduler-action'))return route.fulfill({json:{success:true,jobs:[{name:'hashibot_agents_5m',active:false,installed:true}]}});
  if(url.pathname.endsWith('/canonical-reporting-worker'))return route.fulfill({json:{success:true,queue:[]}});
  return route.fulfill({json:[]});
 });
 await page.goto('/admin/telegram');await expect(page.getByRole('heading',{name:'Telegram Hub',exact:true}).last()).toBeVisible();await expect(page.getByLabel('Forex & Gold VIP channel ID')).toHaveValue('-1002');
 await page.screenshot({path:`test-results/telegram-hub-${test.info().project.name}.png`,fullPage:true});
 await page.getByLabel('Forex & Gold VIP channel ID').fill('-1009');const forex=page.locator('article').filter({has:page.getByRole('heading',{name:'Forex & Gold VIP',exact:true})});await forex.getByRole('button',{name:'Save paused',exact:true}).click();await expect.poll(()=>actions.some(a=>a.action==='SAVE_CHANNEL'&&a.audience==='VIP_FOREX_GOLD'&&a.chat_id==='-1009'&&a.enabled===false)).toBe(true);
 await forex.getByRole('button',{name:'Verify & enable',exact:true}).click();await expect(page.getByRole('status')).toContainText('verified');await forex.getByRole('button',{name:'Send real test',exact:true}).click();await expect(page.getByRole('status')).toContainText('fixture-message-1');
 for(const [button,heading] of [['Members & access','Members, invites & access'],['Delivery & recovery','Canonical reporting queue'],['Schedules','Worker schedules'],['Content & destinations','Subscriber content policy']]){await page.getByRole('button',{name:button,exact:true}).click();await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
 await page.getByRole('button',{name:'Setups & follow-ups',exact:true}).click();await expect(page.getByRole('heading',{name:'Scalp, Intraday & Swing control',exact:true})).toBeVisible();await page.getByText('Strategy coverage & decision evidence · 3 strategies observed',{exact:true}).click();await expect(page.getByText('crypto.micro-scalper · 1.0.0',{exact:true})).toBeVisible();await page.getByText('Asset watch health · 4/48 base streams recorded',{exact:true}).click();await expect(page.getByText('EURUSD · 1h',{exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/asset-watch-${test.info().project.name}.png`,fullPage:true});
 await page.goto('/admin/telegram-links');await expect(page).toHaveURL(/\/admin\/telegram\?tab=members/);
 await page.goto('/admin/growth-goal');await expect(page.getByRole('heading',{name:'Growth Funnel',exact:true}).last()).toBeVisible();await expect(page.getByRole('progressbar',{name:'Free members goal'})).toHaveAttribute('value','1000');await expect(page.getByRole('progressbar',{name:'Paid VIP Signals customers goal'})).toHaveAttribute('value','1000');await expect(page.getByText('1,201',{exact:false}).first()).toBeVisible();
 await page.screenshot({path:`test-results/growth-funnel-${test.info().project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Campaigns & acquisition',exact:true}).click();await expect(page.getByRole('heading',{name:'Campaign editor',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Destination policy',exact:true})).toHaveCount(0);
 await page.goto('/admin/growth-goal');unavailable=true;await page.getByRole('button',{name:'Refresh totals',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('progressbar')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
