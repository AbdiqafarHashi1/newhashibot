import {VIP_CONFIG_IDS} from '../../../supabase/functions/_shared/vip-signal-policy.ts';
import {covers,ms} from './replay.ts';
/** Earliest saved eligible entry per UTC day; no retrospective winner selection or leverage/margin assumptions. */
export function manualVipReplay(input:any,w:{name:string;start:string;days:number;crypto:boolean},risk:number){
 const start=Date.parse(w.start),end=start+w.days*86400000,expected=[...VIP_CONFIG_IDS],ids=expected.filter(id=>covers(input.coverage,id,start,end));
 const source=input.trades.filter((t:any)=>ids.includes(t.strategy)&&ms(t.entry)>=start&&ms(t.entry)<end),events=source.flatMap((t:any)=>[{at:ms(t.entry),kind:1,t},{at:ms(t.exit),kind:0,t}]).sort((a:any,b:any)=>a.at-b.at||a.kind-b.kind||String(a.t.id).localeCompare(String(b.t.id)));
 let balance=10000,peak=10000,dd=0,day='',entries=0,closed=0;const open=new Map<string,any>();
 for(const e of events){if(e.at>=end)break;const key=e.t.strategy+':'+e.t.id;if(e.kind===0){const held=open.get(key);if(!held)continue;balance+=held.risk*e.t.netR;peak=Math.max(peak,balance);dd=Math.max(dd,(peak-balance)/peak*100);open.delete(key);closed++;}else{const d=new Date(e.at).toISOString().slice(0,10);if(d===day||balance<=0||open.size>=3||[...open.values()].some(t=>t.symbol===e.t.symbol))continue;day=d;entries++;open.set(key,{...e.t,risk:balance*risk/100});}}
 return {window:w,risk,ids,expected,entries,closed,openAtEnd:open.size,returnPct:(balance/10000-1)*100,realizedMaxDrawdownPct:dd,returnDD:dd>0?((balance/10000-1)*100)/dd:null};
}
