import type {AdaptiveMarketState} from './adaptive-market-policy.ts';
export interface GovernorLabel {id:string;strategyId:string;symbol:string;state:AdaptiveMarketState;entryAt:string;knownAt:string;netR:number;stressNetR:number;sourceHash:string;classification:'SIMULATED'|'FORWARD_OBSERVED'}
export interface GovernorPolicy {windowDays:number;minimumOutcomes:number;minimumWeeks:number;minimumPF:number;minimumMeanR:number;lowerMeanZ:number;minimumAssetOutcomes:number;states:Record<string,readonly string[]>}
export interface GovernorRequest {strategyId:string;symbol:string;state:AdaptiveMarketState;at:string;sourceHash:string}
/** Pure eligibility research. Never grants a release, changes parameters or sizes accounts. */
export function evaluateEvidenceGovernor(request:GovernorRequest,labels:readonly GovernorLabel[],policy:GovernorPolicy){
 const at=Date.parse(request.at),reasons:string[]=[];
 const empty={eligible:false,reasons,observations:0,weeks:0,meanR:null as number|null,profitFactor:null as number|null,stressMeanR:null as number|null,lowerMeanR:null as number|null,assetObservations:0};
 if(!Number.isFinite(at)||!/^[a-f0-9]{64}$/.test(request.sourceHash)||labels.length>20000||![policy.windowDays,policy.minimumOutcomes,policy.minimumWeeks,policy.minimumPF,policy.minimumMeanR,policy.lowerMeanZ,policy.minimumAssetOutcomes].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(policy.minimumOutcomes)||!Number.isInteger(policy.minimumWeeks)||!Number.isInteger(policy.minimumAssetOutcomes)||!policy.states||typeof policy.states!=='object'||Object.values(policy.states).some(v=>!Array.isArray(v)))return {...empty,reasons:['INVALID_REQUEST_OR_POLICY']};
 if(['INVALID','SHOCK'].includes(request.state)||!policy.states[request.strategyId]?.includes(request.state))return {...empty,reasons:['UNSUPPORTED_MARKET_STATE']};
 const scope=labels.filter(l=>l.strategyId===request.strategyId&&l.state===request.state);
 if(scope.some(l=>!Number.isFinite(Date.parse(l.knownAt))))return {...empty,reasons:['INVALID_EVIDENCE_TIME']};
 const relevant=scope.filter(l=>Date.parse(l.knownAt)<at&&Date.parse(l.knownAt)>=at-policy.windowDays*86400000);
 const seen=new Map<string,string>();
 for(const l of relevant){const identity=JSON.stringify(l);if(!l.id||!Number.isFinite(l.netR)||!Number.isFinite(l.stressNetR)||l.stressNetR>l.netR+1e-9||!Number.isFinite(Date.parse(l.entryAt))||!Number.isFinite(Date.parse(l.knownAt))||Date.parse(l.knownAt)<=Date.parse(l.entryAt)||l.sourceHash!==request.sourceHash||!['SIMULATED','FORWARD_OBSERVED'].includes(l.classification))return {...empty,reasons:['INVALID_EVIDENCE']};if(seen.has(l.id)&&seen.get(l.id)!==identity)return {...empty,reasons:['CONFLICTING_EVIDENCE']};seen.set(l.id,identity);}
 const unique=[...new Map(relevant.map(l=>[l.id,l])).values()],n=unique.length,mean=n?unique.reduce((a,l)=>a+l.netR,0)/n:null;
 const weeks=new Map<number,GovernorLabel[]>();for(const l of unique){const w=Math.floor((Date.parse(l.entryAt)-345600000)/604800000),g=weeks.get(w)??[];g.push(l);weeks.set(w,g);}
 const gain=unique.reduce((a,l)=>a+Math.max(0,l.netR),0),loss=unique.reduce((a,l)=>a+Math.max(0,-l.netR),0),pf=loss?gain/loss:null,stress=n?unique.reduce((a,l)=>a+l.stressNetR,0)/n:null;
 const g=weeks.size,se=n&&g>1?Math.sqrt(g/(g-1)*[...weeks.values()].reduce((a,group)=>a+group.reduce((s,l)=>s+l.netR-mean!,0)**2,0))/n:null;
 const lower=se===null||mean===null?null:mean-policy.lowerMeanZ*se,asset=unique.filter(l=>l.symbol===request.symbol),assetMean=asset.length?asset.reduce((a,l)=>a+l.netR,0)/asset.length:null;
 if(n<policy.minimumOutcomes)reasons.push('INSUFFICIENT_MATCHING_OUTCOMES');if(g<policy.minimumWeeks)reasons.push('INSUFFICIENT_TIME_COVERAGE');if(mean===null||mean<policy.minimumMeanR)reasons.push('MEASURED_EXPECTANCY_WEAK');if(pf===null||pf<policy.minimumPF)reasons.push('PROFIT_FACTOR_WEAK');if(stress===null||stress<=0)reasons.push('COST_STRESS_WEAK');if(lower===null||lower<=0)reasons.push('UNCERTAINTY_TOO_HIGH');if(asset.length<policy.minimumAssetOutcomes||assetMean===null||assetMean<=0)reasons.push('ASSET_EVIDENCE_WEAK');
 return {eligible:reasons.length===0,reasons,observations:n,weeks:g,meanR:mean,profitFactor:pf,stressMeanR:stress,lowerMeanR:lower,assetObservations:asset.length};
}
