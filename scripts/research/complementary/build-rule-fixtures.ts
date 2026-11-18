import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {COMPLEMENTARY_ROLES,complementaryAggregate,evaluateComplementary} from '../../../supabase/functions/_shared/complementary-strategies.ts';import {calculateActiveIndicators} from '../../../supabase/functions/_shared/active-validation-runtime.ts';
const [root]=process.argv.slice(2);if(!root)throw Error('Source cache required');const records=[];
for(const role of COMPLEMENTARY_ROLES){let found;
 for(const receipt of ['evidence-final-hourly.json.gz','evidence-final-intraday.json.gz','evidence-swing.json.gz']){
  const raw=await readFile(`docs/research/complementary/${receipt}`),study=JSON.parse(gunzipSync(raw).toString());
  const candidates=study.ledger.filter((x:any)=>x.stream!=='COMBINED'&&x.candidate.strategyId.endsWith(`complementary-${role}`));
  for(const item of candidates){const c=item.candidate,source=await readFile(`${root}/${c.symbol}-${c.timeframe}.json`),rows=JSON.parse(source.toString()),width=({'15m':900000,'1h':3600000,'4h':14400000} as any)[c.timeframe],i=rows.findIndex((b:any)=>Date.parse(b.open_time)+width===Date.parse(item.decisionAt));if(i<0)continue;
   const candles=rows.slice(Math.max(0,i-959),i+1),higher=complementaryAggregate(candles,width,c.timeframe==='1h'?14400000:3600000).slice(-220),ctx={symbol:c.symbol,market:c.market,timeframe:c.timeframe,candles,indicators:calculateActiveIndicators(candles),evaluated_at:item.decisionAt,higher_timeframe_candles:higher};
   const actual=evaluateComplementary(role,ctx);if(actual.status!=='candidate')continue;
   found={role,context:ctx,expectedDirection:actual.direction,lineage:{receipt,receiptSha256:createHash('sha256').update(raw).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),candidateId:c.id}};break;
  }
  if(found)break;
 }
 if(!found)throw Error(`NO_REACHABLE_REAL_FIXTURE:${role}`);records.push(found);
}
await mkdir('tests/complementary/fixtures',{recursive:true});await writeFile('tests/complementary/fixtures/native-rules.json.gz',gzipSync(JSON.stringify(records),{level:9}));console.log(records.map(r=>({role:r.role,side:r.expectedDirection})));
