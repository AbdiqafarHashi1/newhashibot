import {immutableSignalHash} from '../../supabase/functions/_shared/scanner-signal-repository.ts';
export function qualifiedFixture(now=Date.now()) {
 const config={id:'crypto.compression-breakout',enabled:true,symbols:['BTCUSDT'],timeframes:['1h'],parameters:{stopAtr:1.4},minRiskReward:1.2};
 const signal:any={id:'s1',candidate_id:'c1',created_at:new Date(now-60000).toISOString(),candle_close_time:new Date(now-120000).toISOString(),expires_at:new Date(now+600000).toISOString(),symbol:'BTCUSDT',market_type:'crypto',timeframe:'1h',direction:'buy',grade:'A',confidence_score:85,source:'scanner',data_source:'REAL DATA',contract_version:'scanner-signal/v2',status:'waiting',strategy_id:config.id,strategy_version:'1.0.0',configuration_version:'config_v2_fixture',entry_low:100,entry_high:101,stop_loss:95,tp1:110,tp2:120,arbitrator_decision:{final_decision:'approved'}};
 signal.immutable_hash=immutableSignalHash(signal);
 const plan={identity:{strategy_version:'1.0.0'},provenance:{measured_release_id:'release-1',evaluated_parameters:{stopAtr:1.4},candle_boundary:{closed_only:true}}};
 const release={id:'release-1',state:'PROMOTED',strategy_id:config.id,immutable_configuration:{strategies:[config]}};
 return {signal,plan,release};
}
