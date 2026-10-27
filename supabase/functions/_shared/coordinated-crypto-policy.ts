import {CRYPTO_TEAM_ROLES} from './coordinated-crypto-contract.ts';
import type {LegacyStrategyResult} from './professional-strategies.ts';
export function cryptoTeamPolicy(entries:readonly {name:string;result:LegacyStrategyResult}[]):string|undefined {
 const team=entries.filter(e=>CRYPTO_TEAM_ROLES.some(r=>r.name===e.name));if(!team.length)return;
 for(const e of team){const b=e.result.score_breakdown,role=CRYPTO_TEAM_ROLES.find(r=>r.name===e.name)!;
  if(b.team_policy!=='crypto-team/v1'||b.team_role!==role.id||b.score_is_probability!==false||!Number.isFinite(Date.parse(String(b.source_close))))return 'TEAM_POLICY_EVIDENCE_INVALID';
  const state=String(b.team_state),buy=e.result.direction==='buy',sell=e.result.direction==='sell';
  if(role.id==='crypto.team-trend'&&!(buy&&state==='TREND_UP'||sell&&state==='TREND_DOWN')||role.id==='crypto.team-range'&&state!=='RANGE'||role.id==='crypto.team-breakout'&&!(buy&&state==='EXPANSION_UP'||sell&&state==='EXPANSION_DOWN')||role.id==='crypto.team-alt'&&!(buy&&['TREND_UP','EXPANSION_UP'].includes(state)))return 'TEAM_ROLE_REGIME_MISMATCH';
 }
 if(new Set(team.map(e=>String(e.result.score_breakdown.team_state))).size>1)return 'TEAM_MARKET_STATE_CONFLICT';
 return '';
}
