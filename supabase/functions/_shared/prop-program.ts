import {PROP_PROFILES,type PropProgramProfile} from '../../../src/lib/prop/professionalPropEngine.ts';
/** Versioned account terms; research and buyer setup consume the same explicit program. */
export const FTMO_SWING_PROGRAM='FTMO_TWO_STEP_SWING' as const;
export const FTMO_SWING_SOURCE='https://ftmo.com/en/trading-objectives/';
export function ftmoSwingProfile():PropProgramProfile {
 const p=structuredClone(PROP_PROFILES.FTMO_TWO_STEP);
 p.programName='FTMO 2-Step Swing';p.profileVersion='2026-11-13-ftmo-2step-swing';p.effectiveDate='2026-11-13';
 p.rules={...p.rules,dailyLossBasis:'START_OF_DAY_BALANCE',dailyLossAmountBasis:'INITIAL_BALANCE',maxLossBasis:'INITIAL_BALANCE',resetTimezone:'Europe/Prague',resetTime:'00:00',dstBehavior:'ZONE_DATABASE'};
 p.verificationNotes=[FTMO_SWING_SOURCE,'https://ftmo.com/en/faq/ftmo-swing-account-type/','Core targets, loss limits, minimum days and Swing news/holding terms checked 2026-11-13. Contract-specific instruments, payouts and account eligibility remain separate.'];
 return p;
}
export function ftmoSwingAccountRules(initialBalance:number,phase:'CHALLENGE'|'VERIFICATION'|'FUNDED'='CHALLENGE'){return {funded_profit_behavior:'CONTINUE_TRADING',funded_profit_target_pct:3,payout_wait_days_initial:14,payout_wait_days_repeat:14,schema_version:'prop-account-rules/v1',program_id:FTMO_SWING_PROGRAM,drawdown_model:'FTMO_2STEP_STATIC_INITIAL',firm_name:'FTMO 2-Step Swing',source_reference:FTMO_SWING_SOURCE,reset_timezone:'Europe/Prague',initial_balance:initialBalance,daily_loss_cap_pct:5,total_loss_cap_pct:10,min_trading_days:phase==='FUNDED'?0:4,current_trading_days:0,news_trading_allowed:true,weekend_holding_allowed:true,breach_status:'HEALTHY'};}
/** Only the explicit approved program can relax the generic news/weekend defaults.
 * This never relaxes account loss, exposure, capital, entitlement or provider checks. */
export function isFtmoSwingRules(p:any){return p?.program_id===FTMO_SWING_PROGRAM&&p.daily_loss_cap_pct===5&&(p.total_loss_cap_pct??p.total_trailing_drawdown_cap_pct)===10&&[0,4].includes(p.min_trading_days)&&p.news_trading_allowed===true&&p.weekend_holding_allowed===true;}

/** Static loss basis is available only with the complete approved program source and clock. */
export function isSourceBoundFtmoStaticRules(p:any){return p?.drawdown_model==='FTMO_2STEP_STATIC_INITIAL'&&p.program_id===FTMO_SWING_PROGRAM&&p.source_reference===FTMO_SWING_SOURCE&&p.reset_timezone==='Europe/Prague'&&isFtmoSwingRules(p)}
