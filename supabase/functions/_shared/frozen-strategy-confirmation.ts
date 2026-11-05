import {watchedStrategyCatalog} from './watched-strategy-catalog.ts';
import {calculateActiveIndicators} from './active-validation-runtime.ts';
import type {ConditionalSetup} from './conditional-signal-service.ts';
import type {StrategyCandle} from './professional-strategies.ts';
/** Resolve the named evaluator with the ORIGINAL parameters, never the edited DB config.
 * A code-version change holds the watch for expiry; it cannot silently change its thesis. */
export function frozenStrategyConfirmation(s:ConditionalSetup,rows:readonly StrategyCandle[],at:number,context?:{higher?:readonly StrategyCandle[];anchor?:readonly StrategyCandle[]}):'CONFIRMED'|'STILL_WAITING'|'DATA_UNAVAILABLE' {
 if(!s.origin)return 'DATA_UNAVAILABLE';
 const configuration=structuredClone(s.origin.configuration),name=s.origin.plan.identity.strategy_name;
 const d=watchedStrategyCatalog([{...configuration,strategy_name:name}]).find(d=>d.id===s.strategy);
 if(!d||d.version!==s.origin.version)return 'DATA_UNAVAILABLE';
 try {
  const result=d.evaluate({symbol:s.symbol,market:s.market??(s.symbol.endsWith('USDT')?'crypto':'forex'),timeframe:s.timeframe,candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:new Date(at).toISOString(),strategy_parameters:configuration.params,higher_timeframe_candles:context?.higher,reference_candles:context?.anchor});
  if(result.rejection_reason==='runtime_error')return 'DATA_UNAVAILABLE';
  return result.status==='candidate'&&result.direction===s.side?'CONFIRMED':'STILL_WAITING';
 } catch {return 'DATA_UNAVAILABLE';}
}

import {entryPolicyQualified} from './entry-decision.ts';
import {stableFingerprint} from './strategy-plan.ts';
import type {StrategyDefinition} from './professional-strategies.ts';
/** A frozen setup cannot keep an approval after its release is revoked/replaced/disabled. */
export function currentWatchQualification(s:ConditionalSetup,definitions:readonly StrategyDefinition[]):boolean{
 const d=definitions.find(d=>d.id===s.strategy),o=s.origin;
 return !!(o&&d&&d.lifecycle==='ENABLED'&&d.config.enabled&&d.publicationMode==='LIVE'&&d.version===o.version&&entryPolicyQualified(d.config)&&d.config.config_source===o.configuration.config_source&&stableFingerprint(d.config.params)===stableFingerprint(o.configuration.params)&&(!d.config.allowed_symbols.length||d.config.allowed_symbols.includes(s.symbol))&&(!d.config.allowed_timeframes.length||d.config.allowed_timeframes.includes(s.timeframe)));
}
