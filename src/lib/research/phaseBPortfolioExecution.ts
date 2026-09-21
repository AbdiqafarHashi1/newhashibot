import { certificationHash, type PortfolioCombination } from "./portfolioCertification";
import { includePortfolio } from "./phaseBCertification";

export type PortfolioProduct="SIGNALS"|"PERSONAL"|"PROP";
export interface PortfolioTrade {strategyId:string;symbol:string;openedAt:string;closedAt:string;netR:number;arbitrationConflict?:boolean;locked?:boolean;propSurvived?:boolean}
export interface PortfolioCandidate {strategyId:string;qualified:Readonly<Record<PortfolioProduct,boolean>>;trades:readonly PortfolioTrade[]}
export interface ProductPortfolio {product:PortfolioProduct;eligibleStrategies:readonly string[];combinations:readonly PortfolioCombination[];selectedStrategyIds:readonly string[]}

function subsets<T>(rows:readonly T[]){const out:T[][]=[];for(let mask=1;mask<2**rows.length;mask++)out.push(rows.filter((_,i)=>Boolean(mask&(1<<i))));return out}
function summarize(ids:readonly string[],all:readonly PortfolioTrade[]){
  const trades=all.filter(x=>ids.includes(x.strategyId)&&!x.locked).sort((a,b)=>a.closedAt.localeCompare(b.closedAt));
  const rs=trades.map(x=>x.netR),wins=rs.filter(x=>x>0).reduce((a,b)=>a+b,0),loss=Math.abs(rs.filter(x=>x<0).reduce((a,b)=>a+b,0));let equity=0,peak=0,dd=0,simultaneous=0;
  for(const trade of trades){equity+=trade.netR;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);simultaneous=Math.max(simultaneous,trades.filter(other=>other.openedAt<=trade.openedAt&&other.closedAt>trade.openedAt).length)}
  const bySymbol=Object.values(trades.reduce<Record<string,number>>((a,x)=>(a[x.symbol]=(a[x.symbol]??0)+Math.abs(x.netR),a),{})),gross=bySymbol.reduce((a,b)=>a+b,0);
  return {netR:equity,expectancyR:rs.length?equity/rs.length:0,profitFactor:loss?wins/loss:wins?Infinity:null,maxDrawdownR:dd,concentrationPct:gross?Math.max(...bySymbol)/gross*100:0,frequency:trades.length,simultaneousExposure:simultaneous,arbitratorConflicts:trades.filter(x=>x.arbitrationConflict).length,propSurvivalPct:trades.some(x=>x.propSurvived!==undefined)?trades.filter(x=>x.propSurvived).length/trades.length*100:null};
}

/** Executes each legitimate subset against the same canonical trade evidence. */
export function executeProductPortfolios(candidates:readonly PortfolioCandidate[]):ProductPortfolio[]{
  return (["SIGNALS","PERSONAL","PROP"] as const).map(product=>{const eligible=candidates.filter(x=>x.qualified[product]).sort((a,b)=>a.strategyId.localeCompare(b.strategyId)).slice(0,12);const all=eligible.flatMap(x=>x.trades),combinations=subsets(eligible).map(group=>{const ids=group.map(x=>x.strategyId),withMetrics=summarize(ids,all);const marginalContribution=Object.fromEntries(ids.map(id=>{const without=summarize(ids.filter(x=>x!==id),all);return[id,{netR:withMetrics.netR-without.netR,expectancyR:withMetrics.expectancyR-without.expectancyR,profitFactor:withMetrics.profitFactor,maxDrawdownR:withMetrics.maxDrawdownR-without.maxDrawdownR,concentrationPct:withMetrics.concentrationPct-without.concentrationPct,frequency:withMetrics.frequency-without.frequency}]}));const included=ids.length===1?withMetrics.netR>0:ids.every(id=>includePortfolio({standaloneQualified:true,marginalNetR:marginalContribution[id].netR,withDrawdownR:withMetrics.maxDrawdownR,withoutDrawdownR:summarize(ids.filter(x=>x!==id),all).maxDrawdownR,concentrationPct:withMetrics.concentrationPct}));return{id:certificationHash({product,ids},"combination"),strategyIds:ids,...withMetrics,marginalContribution,included,reasons:included?[]:["HARMFUL_MARGINAL_CONTRIBUTION"]} satisfies PortfolioCombination});const selected=[...combinations].filter(x=>x.included).sort((a,b)=>b.netR-a.netR||b.strategyIds.length-a.strategyIds.length)[0];return{product,eligibleStrategies:eligible.map(x=>x.strategyId),combinations,selectedStrategyIds:selected?.strategyIds??[]}});
}
