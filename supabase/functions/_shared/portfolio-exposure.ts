export interface RiskPosition {symbol:string;open_risk_pct:number;}
/** Conservative shared risk factors, not estimated correlation coefficients or synthetic hedges. */
export function exposureFactors(symbol:string):string[]{
 const s=symbol.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(s.endsWith('USDT'))return ['CRYPTO_MARKET','USD_QUOTE'];
 const pair=/^([A-Z]{3})([A-Z]{3})/.exec(s);
 const currencies=new Set(['USD','EUR','GBP','JPY','AUD','CAD','NZD','CHF','XAU','XAG']);
 if(pair&&currencies.has(pair[1])&&currencies.has(pair[2]))return [...new Set([`CURRENCY_${pair[1]}`,`CURRENCY_${pair[2]}`])];
 return ['UNCLASSIFIED'];
}
export function portfolioRiskGate(input:{symbol:string;positions:readonly RiskPosition[];requestedRiskPct:number;portfolioLimitPct:number;correlatedLimitPct:number}):{allowed:boolean;reasons:string[];totalRiskPct:number;factorRiskPct:Record<string,number>}{
 const {positions,requestedRiskPct:r,portfolioLimitPct:limit,correlatedLimitPct:correlated}=input,reasons:string[]=[],factorRiskPct:Record<string,number>={};let totalRiskPct=0;
 if(![r,limit,correlated].every(Number.isFinite)||r<0||limit<=0||correlated<=0||correlated>limit)reasons.push('PORTFOLIO_RISK_POLICY_INVALID');
 for(const p of positions){if(!p.symbol||!Number.isFinite(p.open_risk_pct)||p.open_risk_pct<0){reasons.push('POSITION_RISK_UNAVAILABLE');continue;}totalRiskPct+=p.open_risk_pct;if(p.open_risk_pct>0&&exposureFactors(p.symbol).includes('UNCLASSIFIED'))reasons.push('CORRELATION_EVIDENCE_UNAVAILABLE');for(const factor of exposureFactors(p.symbol))factorRiskPct[factor]=(factorRiskPct[factor]??0)+p.open_risk_pct;}
 if(totalRiskPct+r>limit+1e-9)reasons.push('PORTFOLIO_RISK_CAPACITY_EXCEEDED');
 if(exposureFactors(input.symbol).includes('UNCLASSIFIED'))reasons.push('CORRELATION_EVIDENCE_UNAVAILABLE');
 if(exposureFactors(input.symbol).some(f=>(factorRiskPct[f]??0)+r>correlated+1e-9))reasons.push('CORRELATED_RISK_CAPACITY_EXCEEDED');
 return {allowed:reasons.length===0,reasons:[...new Set(reasons)],totalRiskPct,factorRiskPct};
}
