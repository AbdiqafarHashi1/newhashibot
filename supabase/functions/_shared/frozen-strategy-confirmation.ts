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
