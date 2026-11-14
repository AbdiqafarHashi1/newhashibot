/** Frozen management contract. Scores and policy IDs never confer live authority. */
export const GOLD_RSI_TRAILING = 'gold.rsi-trailing-15-48-1.5-5-h96' as const;
export const GOLD_TRAILING_POLICY = Object.freeze({version:'gold-atr-trailing/v1',strategyId:GOLD_RSI_TRAILING,timeframe:'15m',atrPeriod:14,triggerR:2,distanceAtr:1,minimumLockedR:.5,maximumHoldingSeconds:86400} as const);
export type AtrTrailingPolicy = typeof GOLD_TRAILING_POLICY;
export interface AtrTrailingState {initialDistance:number;bestFavorable:number;stop:number;}
export function validateTrailingTransition(prior:AtrTrailingState|undefined,next:AtrTrailingState|undefined,side:1|-1,entry:number,initialStop:number){
 if(!next){if(prior)throw Error('TRAILING_STATE_CANNOT_BE_REMOVED');return;}
 if(![next.initialDistance,next.stop].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(next.bestFavorable)||next.bestFavorable<0||Math.abs(next.initialDistance-Math.abs(entry-initialStop))>1e-7||side*(next.stop-(prior?.stop??initialStop))<-1e-8||next.bestFavorable<(prior?.bestFavorable??0)||prior&&next.initialDistance!==prior.initialDistance)throw Error('TRAILING_STATE_CANNOT_LOOSEN_OR_REBASE');
}
export function validateAtrTrailingPolicy(value:unknown):AtrTrailingPolicy {
 if(!value||typeof value!=='object'||Object.keys(value).sort().join('|')!==Object.keys(GOLD_TRAILING_POLICY).sort().join('|')||Object.entries(GOLD_TRAILING_POLICY).some(([k,v])=>(value as Record<string,unknown>)[k]!==v))throw Error('FROZEN_ATR_TRAILING_POLICY_REQUIRED');
 return {...GOLD_TRAILING_POLICY};
}
/** R remains the original fill-to-stop distance even after protection improves. */
export function nextAtrTrailingStop(input:{side:1|-1;entry:number;initialDistance:number;bestFavorable:number;currentStop:number;atr:number;tick:number}) {
 const {side,entry,initialDistance,bestFavorable,currentStop,atr,tick}=input;
 if(![entry,initialDistance,currentStop,atr,tick].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(bestFavorable)||bestFavorable<0||![1,-1].includes(side))throw Error('ATR_TRAILING_INPUT_INVALID');
 if(bestFavorable<GOLD_TRAILING_POLICY.triggerR*initialDistance)return currentStop;
 const raw=entry+side*Math.max(GOLD_TRAILING_POLICY.minimumLockedR*initialDistance,bestFavorable-GOLD_TRAILING_POLICY.distanceAtr*atr);
 // Round towards the existing stop. A tick cannot promise unobserved extra protection.
 const target=(side===1?Math.floor(raw/tick+1e-8):Math.ceil(raw/tick-1e-8))*tick;
 return side*(target-currentStop)>tick*.5?target:currentStop;
}
export function simpleClosedAtr(rows:readonly {high:number;low:number;close:number}[],period=14){
 if(rows.length<period+1)return null;
 const tail=rows.slice(-period-1);let total=0;
 for(let i=1;i<tail.length;i++){const b=tail[i],p=tail[i-1];if(![b.high,b.low,b.close,p.close].every(Number.isFinite)||b.low<=0||b.high<b.low)return null;total+=Math.max(b.high-b.low,Math.abs(b.high-p.close),Math.abs(b.low-p.close));}
 const value=total/period;return value>0?value:null;
}
