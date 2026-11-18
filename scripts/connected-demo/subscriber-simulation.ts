import {readFileSync,writeFileSync} from 'node:fs';
import {VIP_CONFIG_IDS} from '../../supabase/functions/_shared/vip-signal-policy.ts';
const root=JSON.parse(readFileSync('.tmp/part1-ledgers.json','utf8')),windows=JSON.parse(readFileSync('docs/research/part1-portfolio-results.json','utf8')).results.filter((w:any)=>w.mode==='PERSONAL');
const ms=(x:string|number)=>typeof x==='number'?x:Date.parse(x);
const rows=[];
for(const w of windows){
 const start=Date.parse(w.start+'T00:00:00Z'),end=start+w.days*86400000;
 const source=root.trades.filter((t:any)=>VIP_CONFIG_IDS.includes(t.strategy)&&ms(t.entry)>=start&&ms(t.entry)<end);
 const events=source.flatMap((t:any)=>[{at:ms(t.entry),kind:1,t},{at:ms(t.exit),kind:0,t}]).sort((a:any,b:any)=>a.at-b.at||a.kind-b.kind||String(a.t.id).localeCompare(String(b.t.id)));
 let balance=10000,peak=10000,dd=0,admitted=0,closed=0,wins=0,gains=0,losses=0,lastDay='';const open=new Map<string,any>();
 for(const e of events){if(e.at>=end)break;const key=e.t.strategy+':'+e.t.id;
  if(e.kind===0){const held=open.get(key);if(!held)continue;const pnl=held.risk*e.t.netR;balance+=pnl;peak=Math.max(peak,balance);dd=Math.max(dd,(peak-balance)/peak*100);closed++;wins+=Number(pnl>0);gains+=Math.max(0,pnl);losses-=Math.min(0,pnl);open.delete(key);}
  else{const day=new Date(e.at).toISOString().slice(0,10);if(day===lastDay||open.size>=3||[...open.values()].some(t=>t.symbol===e.t.symbol))continue;admitted++;lastDay=day;open.set(key,{...e.t,risk:balance*.01});}
 }
 const coverage=VIP_CONFIG_IDS.filter(id=>root.coverage.some((c:any)=>c.strategy===id&&ms(c.start)<=start&&ms(c.end)>=end)).length;
 rows.push(`| ${w.start} / ${w.days}d | ${coverage}/14 | ${admitted} / ${closed} | ${closed?(wins/closed*100).toFixed(2):'—'} | ${losses?(gains/losses).toFixed(2):'—'} | ${((balance/10000-1)*100).toFixed(2)} | ${dd.toFixed(2)} | ${open.size} |`);
}
const p='docs/research/part1-portfolio-scorecard.md',base=readFileSync(p,'utf8');
const section='\n## Diagnostic 3 — one-trade-per-day VIP subscriber replay\n\nFourteen VIP configs; the two broadcast exclusions apply only here. Starting equity $10,000 per window; flat 1.0% cash risk frozen at entry; maximum one admitted entry per UTC day, one open position per symbol and three open positions total. Select the earliest eligible saved entry (ties by source signal ID), without knowing its outcome. A skipped conflicting entry does not consume the daily slot. Source fees/carry remain netted in R. No House-Money scaling, new candle data, Friday repricing or invented replacement signals. Source exits retain their original management; the optional subscriber 1.5R breakeven checkpoint is not replayed or validated by this table. These are realized-close results from previously account-admitted source trades, not the full live subscriber opportunity stream. Open positions are unmarked; source-period gaps and overlapping windows remain. Entry count is a cap, not a promise of a daily signal. Win rates below are research diagnostics, never Telegram signal-card text.\n\n| Window | Full-period coverage | Entries / closes | Closed win % | Cash PF | Realized return % | Realized DD % | End-open |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'+rows.join('\n')+'\n';
if(base.includes('## Diagnostic 3'))throw Error('Subscriber diagnostic already appended');writeFileSync(p,base+section);console.log(section);
