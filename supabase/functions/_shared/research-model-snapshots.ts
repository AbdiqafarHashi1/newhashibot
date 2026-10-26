import {costAwareResearchDefinitions,predictUtility} from './cost-aware-opportunities.ts';
import type {ApprovedReplayConfiguration} from './active-validation-runtime.ts';
import type {ReplayFillAssumptions} from './replay-outcomes.ts';
export async function researchModelSnapshot(input:Record<string,any>){
 const id=String(input.strategyId??(input.market==='crypto'?'crypto.cost-aware-15m':input.market==='forex'?'forex.cost-aware-hourly':'')),definition=costAwareResearchDefinitions().find(d=>d.id===id),p=input.parameters;
 if(!definition||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length>5000||Object.values(p).some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('RESEARCH_MODEL_CONTRACT_INVALID');
 if(p.publication_approved!==0||p.feature_count!==(definition.market==='crypto'?22:19)||p.trained_through_ms>=p.valid_from_ms||p.valid_until_ms<=p.valid_from_ms||p.minimum_predicted_net_r<.15||p.stop_atr!==2||p.max_bars!==32||p.target_r!==2.5||p.tp1_r!==1||p.estimated_cost_bps<0)throw Error('RESEARCH_MODEL_POLICY_INVALID');
 for(const key of ['trained_through_ms','valid_from_ms','valid_until_ms','minimum_predicted_net_r','estimated_cost_bps'])if(!Number.isFinite(p[key]))throw Error('RESEARCH_MODEL_REQUIRED_FIELD_MISSING');
 predictUtility(Array(p.feature_count).fill(0),p);
 const cryptoMarket=definition.market==='crypto';if(Math.abs(p.estimated_cost_bps-(cryptoMarket?20.5:1.3))>1e-9)throw Error('RESEARCH_MODEL_COST_PROTOCOL_UNSUPPORTED');
 const outcomeAssumptions:ReplayFillAssumptions={entryTiming:'NEXT_OPEN',feeBps:cryptoMarket?10:.7,spreadBps:cryptoMarket?2:0,slippageBps:cryptoMarket?4:.3,fundingBps:cryptoMarket?4.5:.3,partialExitPct:.5,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',tp1StopPolicy:'CONSERVATIVE_SAME_BAR',maxBarsInTrade:32,closeAtHorizon:true};
 const configuration:ApprovedReplayConfiguration&{researchOnly:true}={version:'research-model/frozen/v1',researchOnly:true,minSignalGrade:'A',outcomeAssumptions,strategies:[{id:definition.id,version:definition.version,enabled:true,minScore:75,minRiskReward:1.5,maxBarsInTrade:32,symbols:[...definition.config.allowed_symbols],timeframes:[...definition.config.allowed_timeframes],parameters:Object.fromEntries(Object.entries(p).sort(([a],[b])=>a.localeCompare(b))) as Record<string,number>}]};
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(configuration)))),x=>x.toString(16).padStart(2,'0')).join('');
 return {configuration,hash,strategyId:definition.id,strategyVersion:definition.version,validFrom:new Date(p.valid_from_ms).toISOString(),validUntil:new Date(p.valid_until_ms).toISOString()};
}
export async function registerResearchModel(db:any,actor:string,input:Record<string,any>){const s=await researchModelSnapshot(input),row={created_by:actor,content_hash:s.hash,strategy_id:s.strategyId,strategy_version:s.strategyVersion,configuration:s.configuration,valid_from:s.validFrom,valid_until:s.validUntil,provenance:{classification:'OPERATOR_IMPORTED_RESEARCH_NOT_VERIFIED_PERFORMANCE',label:String(input.id??s.strategyId).slice(0,120)},publication_eligible:false};
 const {data,error}=await db.from('validation_research_models').insert(row).select('id,strategy_id,valid_from,valid_until').single();if(data)return data;if(error?.code!=='23505')throw error;
 const prior=await db.from('validation_research_models').select('id,strategy_id,valid_from,valid_until').eq('created_by',actor).eq('content_hash',s.hash).single();if(prior.error)throw prior.error;return prior.data;
}
