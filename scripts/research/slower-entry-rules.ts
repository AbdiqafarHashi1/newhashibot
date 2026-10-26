export interface DecisionBar {high:number;low:number;close:number}
/** Index identifies an already closed bar. Future values must never enter the decision. */
export function slowerEntry(bars:readonly DecisionBar[],index:number,id:'4H_BREAKOUT'|'DAILY_MOMENTUM'){
 if(index<60||index>=bars.length) return {sign:0,atr:0};
 const b=bars[index],previous=bars.slice(index-20,index);
 const atr=previous.reduce((n,c,k)=>{const prior=bars[index-21+k].close;return n+Math.max(c.high-c.low,Math.abs(c.high-prior),Math.abs(c.low-prior));},0)/20;
 if(!Number.isFinite(atr)||atr<=0)return {sign:0,atr:0};
 if(id==='4H_BREAKOUT')return {atr,sign:b.close>Math.max(...previous.map(c=>c.high))?1:b.close<Math.min(...previous.map(c=>c.low))?-1:0};
 const a=b.close-bars[index-20].close,z=b.close-bars[index-60].close;
 return {atr,sign:a>0&&z>0?1:a<0&&z<0?-1:0};
}
