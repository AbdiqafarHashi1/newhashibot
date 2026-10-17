import {FOREX_STRATEGY_CONTRACTS} from './forex-runtime-contracts.ts';
const names:Record<string,string>={...Object.fromEntries(FOREX_STRATEGY_CONTRACTS.map(c=>[c.id,c.legacyName])),'crypto.micro-scalper':'MicroScalper','crypto.quick-scalp':'QuickScalp','crypto.compression-breakout':'CompressionBreakout','crypto.swing-continuation':'SwingContinuation'};
/** The production scanner consumes the frozen tested values. Editing the research config cannot change a release. */
export function measuredRuntimeConfiguration(name:string,current:any,releases:any[],minimumGrade:string){
 const release=releases.find(r=>r.state==='PROMOTED'&&names[r.strategy_id]===name),frozen=release?.immutable_configuration;
 const strategy=frozen?.strategies?.find((s:any)=>s.id===release.strategy_id&&s.enabled===true);
 if(!strategy||frozen.minSignalGrade!==minimumGrade)return {...current,enabled:false,config_source:'measured_release_required'};
 return {...current,enabled:current.enabled===true,config_source:`measured_release:${release.id}`,min_score:strategy.minScore,min_rr:strategy.minRiskReward,max_bars_in_trade:strategy.maxBarsInTrade,min_stop_distance_pct:strategy.minStopDistancePct??0,min_tp1_distance_pct:strategy.minTp1DistancePct??0,min_tp2_distance_pct:strategy.minTp2DistancePct??0,allowed_symbols:strategy.symbols,allowed_timeframes:strategy.timeframes,params:strategy.parameters};
}
