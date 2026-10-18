/** Recompute account paths from frozen signal outcomes; never retune strategies. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {simulateResearchAccount,repeatedResearchChallenges,type ScenarioPolicy} from '../../supabase/functions/_shared/research-account-scenarios.ts';
const [kind,path]=process.argv.slice(2);if(!['forex','crypto'].includes(kind)||!path)throw Error('Usage: node --import tsx scripts/research/revalue-account-scenarios.ts <forex|crypto> <report.json>');
const report=JSON.parse(await readFile(path,'utf8')),source=await readFile('supabase/functions/_shared/research-account-scenarios.ts','utf8');
report.accountModelHash=createHash('sha256').update(source).digest('hex');
report.accountModelNotes=['Stop risk plus declared costs must fit remaining daily and total-loss budgets before a risk-capped entry.','Underlying signals, market outcomes, frozen parameters and economic promotion gates are unchanged.','Research R accounting is not native MT5 lot/quote-currency conversion or broker margin certification.','Daily equity uses a conservative trade-level adverse-excursion proxy; this is not a full firm-specific intraday mark-to-market path.'];
if(kind==='forex'){
 const personal:ScenarioPolicy={initialEquity:10000,riskPct:.5,leverage:5,mode:'RISK_CAPPED',marginUtilization:.95,maintenanceMarginRate:.005,dailyLockPct:2,totalLossPct:10},prop:ScenarioPolicy={...personal,riskPct:.3,leverage:2,dailyLockPct:1,firmDailyLossPct:5};
 for(const row of report.results){if(!row.holdout?.signals)continue;row.personal=simulateResearchAccount(row.holdout.signals,personal);row.prop=simulateResearchAccount(row.holdout.signals,prop);row.challenges=repeatedResearchChallenges(row.holdout.signals,prop,100,30);row.productQualification={personal:row.status==='INDICATIVE_FORWARD_DEMO_CANDIDATE'&&row.personal.returnPct>0?'INDICATIVE_DEMO_CANDIDATE_ONLY':'NOT_QUALIFIED',prop:'BLOCKED_BROKER_NEWS_AND_FIRM_RULE_EVIDENCE_REQUIRED'};}
}else{
 for(const scenario of report.accounts)scenario.result=simulateResearchAccount(report.holdout.signals,{initialEquity:1000,riskPct:.5,leverage:scenario.leverage,mode:scenario.mode,marginUtilization:.95,maintenanceMarginRate:.005,dailyLockPct:2,totalLossPct:10});
}
await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind,path,accountModelHash:report.accountModelHash}));
