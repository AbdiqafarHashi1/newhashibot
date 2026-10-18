import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const forex=read('docs/research/FOREX_PERSONAL_PROP_2026-10-18.json'),crypto=read('docs/research/CRYPTO_LEVERAGE_2026-10-18.json');
const accountHash=createHash('sha256').update(readFileSync('supabase/functions/_shared/research-account-scenarios.ts','utf8')).digest('hex');
assert.equal(forex.accountModelHash,accountHash);assert.equal(crypto.accountModelHash,accountHash);
assert.equal(forex.sources.reduce((n:number,s:any)=>n+s.manifest.rows,0),89268);
assert.equal(crypto.sources.reduce((n:number,s:any)=>n+s.rows,0),52416);
assert.equal(forex.promoted,false);assert.equal(crypto.promoted,false);assert.equal(crypto.liveLeverageCapsChanged,false);
assert.equal(forex.results.find((x:any)=>x.strategyId==='gold.volatility-breakout').status,'BLOCKED_REAL_XAUUSD_HISTORY_UNAVAILABLE');
assert.equal(forex.results.find((x:any)=>x.strategyId==='forex.london-breakout').status,'INSUFFICIENT_DEVELOPMENT_TRADES');
for(const row of forex.results.filter((r:any)=>r.holdout)){
 assert.equal(row.status,'REJECTED_NOT_FOR_PROMOTION');assert.ok(row.holdout.metrics.profitFactor<1);
 assert.equal(Object.values(row.holdout.bySymbol).reduce((n:number,s:any)=>n+s.trades,0),row.holdout.metrics.tradeCount);
 assert.equal(row.productQualification.prop,'BLOCKED_BROKER_NEWS_AND_FIRM_RULE_EVIDENCE_REQUIRED');
 assert.equal(row.frozenConfig.configurationHash,createHash('sha256').update(JSON.stringify(row.frozenConfig.configuration)).digest('hex'));
}
const challenges=forex.results.flatMap((r:any)=>r.challenges?[r.challenges]:[]);
assert.equal(challenges.reduce((n:number,c:any)=>n+c.actualAttempts,0),300);
assert.equal(challenges.reduce((n:number,c:any)=>n+c.passes,0),0);
assert.equal(challenges.reduce((n:number,c:any)=>n+c.incomplete,0),300);
for(const c of challenges){assert.equal(c.newsAndBrokerRulesVerified,false);assert.equal(new Set(c.windows.map((w:any)=>w.start)).size,c.actualAttempts);}
const capped=(leverage:number)=>crypto.accounts.find((x:any)=>x.leverage===leverage&&x.mode==='RISK_CAPPED').result;
assert.equal(capped(10).endingEquity,capped(20).endingEquity);assert.ok(capped(20).totalRiskBudgetLocked>0);assert.ok(capped(20).endingEquity>=900);
assert.equal(crypto.status,'REJECTED_NOT_FOR_PROMOTION');assert.ok(crypto.holdout.metrics.profitFactor<1);
console.log('Recorded Forex/crypto source, frozen-config, account-model, leverage and challenge evidence checks passed');
const combined=read('docs/research/FOREX_COMBINED_SCANNER_2026-10-18.json');
assert.equal(combined.sourceIndividualReportHash,forex.fullReportSha256);
assert.equal(combined.accountModelHash,accountHash);assert.equal(combined.promoted,false);
assert.equal(combined.proposals,combined.signals+combined.globalSignalBlocked+combined.excluded);
assert.equal(combined.signals,combined.metrics.tradeCount);assert.ok(combined.metrics.profitFactor<1);
assert.ok(combined.personal.returnPct<0&&combined.prop.returnPct<0);
assert.ok(Date.parse(combined.commonPeriod.end)-Date.parse(combined.commonPeriod.start)<30*86400000);
