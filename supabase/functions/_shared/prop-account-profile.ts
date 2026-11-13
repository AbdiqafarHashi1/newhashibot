import {PROP_SERVICE_MAX_INITIAL_USD} from './prop-service-limits.ts';
import {FTMO_SWING_PROGRAM,isFtmoSwingRules,FTMO_SWING_SOURCE} from './prop-program.ts';
/** Owner-approved firm constraints. No inferred firm rules, reset clock or breach status. */
export function validatePropAccountProfile(value:any){
 if(!value||value.schema_version!=='prop-account-rules/v1'||!String(value.firm_name??'').trim()||!String(value.source_reference??'').trim()||value.drawdown_model!=='CONSERVATIVE_OBSERVED_HIGH_WATER')throw Error('APPROVED_PROP_RULE_SOURCE_REQUIRED');
 for(const key of ['initial_balance','daily_loss_cap_pct','total_loss_cap_pct'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<=0||(key!=='initial_balance'&&value[key]>100))throw Error('PROP_RULE_LIMIT_REQUIRED');
 if(value.initial_balance>PROP_SERVICE_MAX_INITIAL_USD)throw Error('PROP_SERVICE_MAX_INITIAL_USD_25000');
 for(const key of ['news_trading_allowed','weekend_holding_allowed'])if(typeof value[key]!=='boolean')throw Error('PROP_RULE_PERMISSION_REQUIRED');
 if(!Number.isInteger(value.min_trading_days)||value.min_trading_days<0||!Number.isInteger(value.current_trading_days)||value.current_trading_days<0||!['HEALTHY','WARNING','BREACHED'].includes(value.breach_status))throw Error('PROP_RULE_STATUS_REQUIRED');
 try{new Intl.DateTimeFormat('en',{timeZone:value.reset_timezone}).format()}catch{throw Error('PROP_RESET_TIMEZONE_REQUIRED')}
 if(typeof value.reset_timezone!=='string'||!value.reset_timezone)throw Error('PROP_RESET_TIMEZONE_REQUIRED');
 if(value.program_id!==undefined&&(value.program_id!==FTMO_SWING_PROGRAM||!isFtmoSwingRules(value)||value.reset_timezone!=='Europe/Prague'||value.source_reference!==FTMO_SWING_SOURCE))throw Error('MATCHING_PROP_PROGRAM_TERMS_REQUIRED');
 return value;
}
export function approvedPropAccountProfile(account:any){
 const p=validatePropAccountProfile(account.policy_overrides?.approved_prop_rules);
 if(p.program_id===FTMO_SWING_PROGRAM&&p.min_trading_days!==(account.account_mode==='PROP_FUNDED'?0:4))throw Error('PROP_PROGRAM_PHASE_MISMATCH');
 if(p.customer_id!==account.customer_id||p.execution_account_id!==account.id||p.policy_version!==account.policy_version||!p.approved_by||!Number.isFinite(Date.parse(p.approved_at)))throw Error('PROP_RULE_APPROVAL_SCOPE_REQUIRED');
 return p;
}
