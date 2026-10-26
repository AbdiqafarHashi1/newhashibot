/** Fixed research experiment. Does not register strategies or publish signals. */
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import {slowerEntry} from './slower-entry-rules.ts';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: slower-entry.ts <verified native directory> <output.json>');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const protocol=JSON.parse(await readFile('scripts/research/slower-entry-protocol.json','utf8'));
const studies=[],sources=[];
for(const symbol of protocol.symbols as string[]){
 const names=(await readdir(root)).filter(n=>n.startsWith(symbol+'-15m-')&&n.endsWith('.json')&&!n.endsWith('.manifest.json')).sort();
 if(names.length!==18)throw Error('INCOMPLETE_SOURCE');const candles:StrategyCandle[]=[];
 for(const name of names){const raw=await readFile(`${root}/${name}`,'utf8'),manifest=JSON.parse(await readFile(`${root}/${name.replace('.json','.manifest.json')}`,'utf8'));if(hash(raw)!==manifest.datasetSha256||manifest.nativeFlow!==true)throw Error('SOURCE_HASH');candles.push(...JSON.parse(raw));sources.push({name,hash:hash(raw)});}
 const start=Date.parse('2025-01-01T00:00:00Z');if(candles.length!==52416||candles.some((c,i)=>c.symbol!==symbol||Date.parse(c.open_time)!==start+i*900000||![c.open,c.high,c.low,c.close].every(x=>Number.isFinite(x)&&x>0)||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high)))throw Error('SOURCE_INTERVAL_OR_OHLC');
 for(const [id,width] of [['4H_BREAKOUT',16],['DAILY_MOMENTUM',96]] as const){
  const bars=[];for(let i=0;i+width<=candles.length;i+=width){const group=candles.slice(i,i+width);bars.push({open:group[0].open,high:Math.max(...group.map(c=>c.high)),low:Math.min(...group.map(c=>c.low)),close:group.at(-1)!.close,last:i+width-1});}
  const outcomes:ReplayOutcome[]=[];let occupiedUntil=-Infinity;
  for(let j=60;j<bars.length;j++){
   const b=bars[j],at=start+(b.last+1)*900000;if(at<=occupiedUntil)continue;
   const {atr,sign}=slowerEntry(bars,j,id);
   if(!sign||!Number.isFinite(atr)||atr<=0)continue;
   const candidate:ArbitrationCandidate={id:`${id}:${symbol}:${at}`,strategyId:id,strategyVersion:'research-v1',market:'crypto',symbol,timeframe:'15m',side:sign===1?'buy':'sell',entry:b.close,stop:b.close-sign*2*atr,targets:[b.close+sign*6*atr],confidence:0,grade:'RESEARCH',score:0,riskReward:3,expiry:new Date(at+900000).toISOString(),fresh:true,lifecycle:'RESEARCH',publicationMode:'SHADOW',evidence:{decisionBarWidth:width},rejectionReasons:[]};
   const result=evaluateReplayOutcome(candidate,candles.slice(b.last+1,b.last+1+288),new Date(at).toISOString(),{entryTiming:'NEXT_OPEN',...protocol.costsBps,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',maxBarsInTrade:288,closeAtHorizon:true});
   if(!result)continue;outcomes.push(result);if(result.status!=='EXCLUDED')occupiedUntil=result.exitTime?Date.parse(result.exitTime):Infinity;
  }
  const summary=summarizeReplayOutcomes(outcomes);studies.push({symbol,id,summary,outcomes});console.log(JSON.stringify({symbol,id,count:summary.resolvedCount,PF:summary.profitFactor,meanR:summary.expectancyR}));
 }
}
const aggregate=['4H_BREAKOUT','DAILY_MOMENTUM'].map(id=>({id,summary:summarizeReplayOutcomes(studies.filter(s=>s.id===id).flatMap(s=>s.outcomes))}));
await mkdir(output.substring(0,output.lastIndexOf('/'))||'.',{recursive:true});
await writeFile(output,JSON.stringify({protocol,sources,sourceHashes:Object.fromEntries(await Promise.all(['scripts/research/slower-entry.ts','scripts/research/slower-entry-rules.ts','scripts/research/slower-entry-protocol.json','supabase/functions/_shared/replay-outcomes.ts'].map(async p=>[p,hash(await readFile(p,'utf8'))]))),aggregate,studies,publication:false,execution:false,promotion:false},null,2)+'\n');
