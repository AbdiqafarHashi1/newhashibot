import {readFileSync,writeFileSync} from 'node:fs';
import {evaluateBrokerFamily,BROKER_FAMILY_CANDIDATES,brokerFamilyId} from '../../../supabase/functions/_shared/broker-strategy-families.ts';
const data=JSON.parse(readFileSync('.tmp/gold-simple/native-bars.json','utf8'));
const wanted=new Set(['gold.native-momentum-15-48-2-5','gold.native-momentum-60-24-2-5','gold.native-band-reentry-15-48-3-5']);
const output=[];
for(const c of BROKER_FAMILY_CANDIDATES){const id=brokerFamilyId(c);if(!wanted.has(id))continue;const rows=data[String(c.minutes)];const candidates=[];const rejected:Record<string,number>={};
 for(let i=0;i<rows.length;i++){const at=new Date(Date.parse(rows[i].open_time)+c.minutes*60000).toISOString();const result=evaluateBrokerFamily({market:'forex',symbol:'XAUUSD',timeframe:c.minutes===60?'1h':'15m',candles:rows.slice(0,i+1),evaluated_at:at} as any,c);
 if(result.status==='candidate')candidates.push({at,side:result.direction==='buy'?1:-1,reference:rows[i].close,stop:result.stop_loss,target:result.tp1,atr:result.score_breakdown.atr14});else rejected[result.rejection_reason]=(rejected[result.rejection_reason]??0)+1;
 }
 output.push({strategy_id:id,configuration:c,candidates,rejected});console.log(id,candidates.length);
}
if(output.length!==3)throw Error('EXACT_EXISTING_CONFIGURATIONS_REQUIRED');writeFileSync('.tmp/gold-simple/native-signals.json',JSON.stringify(output));
