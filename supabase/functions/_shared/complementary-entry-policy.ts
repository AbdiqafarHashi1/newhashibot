import {COMPLEMENTARY_VERSION,COMPLEMENTARY_ROLES} from './complementary-strategies.ts';
import type {ConditionalSetup} from './conditional-signal-service.ts';
/** A named evaluator already owns its directional/regime confirmation. This does
 * not bypass data freshness, news, cost, geometry, arbitration or account risk. */
export function complementaryOwnsConfirmation(s:ConditionalSetup):boolean {
 const o=s.origin,id=s.strategy,role=id.split('.complementary-')[1];
 return !!(o&&/^(crypto|forex)\.complementary-/.test(id)&&COMPLEMENTARY_ROLES.includes(role as typeof COMPLEMENTARY_ROLES[number])&&
  o.version===COMPLEMENTARY_VERSION&&o.plan.identity.strategy_id===id&&o.plan.identity.strategy_version===o.version&&
  o.configuration.config_source?.startsWith('measured_release:')&&o.configuration.params.entry_engine_version===1&&
  o.plan.evidence.strategy_specific.complementary_policy==='complementary/v1'&&o.plan.evidence.strategy_specific.score_is_probability===false&&
  o.thesis.directionPolicy==='NAMED_STRATEGY');
}
