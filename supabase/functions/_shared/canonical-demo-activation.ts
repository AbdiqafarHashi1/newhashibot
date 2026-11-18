import {watchedStrategyCatalog} from './watched-strategy-catalog.ts';
import type {StrategyDefinition} from './professional-strategies.ts';
/** A legacy enabled flag is not evidence that a configuration passed a measured release. */
export function unreviewedEnabledStrategyNames(definitions:readonly StrategyDefinition[]){
 return definitions.filter(d=>d.lifecycle==='ENABLED'&&d.certification==='PRODUCTION'&&d.config.enabled&&!d.config.config_source?.startsWith('measured_release:')).map(d=>d.legacyName);
}
export async function installReviewedDemoBundle(db:any,actor:string,bundle:unknown){
 const [configs,releases]=await Promise.all([db.from('strategy_configs').select('*'),db.from('strategy_release_candidates').select('*').eq('state','PROMOTED')]);
 if(configs.error)throw configs.error;if(releases.error)throw releases.error;
 const names=unreviewedEnabledStrategyNames(watchedStrategyCatalog(configs.data??[],releases.data??[]));
 // Disable old unreviewed defaults before installing the tested bundle. A failed
 // install can be retried; it cannot leave unreviewed defaults sending signals.
 if(names.length){const retired=await db.from('strategy_configs').update({enabled:false}).in('strategy_name',names);if(retired.error)throw retired.error;}
 const installed=await db.rpc('install_canonical_demo_strategy_bundle',{p_actor:actor,p_bundle:bundle});if(installed.error)throw installed.error;return installed.data;
}
