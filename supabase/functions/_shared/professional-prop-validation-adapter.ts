import {buildChallengeWindows,simulateFullChallengeWindows,summarizeFullChallengeWindows,type HistoricalTradeEvidence,type PropAccountConfiguration,type PropProgramProfile,type ChallengeWindow,type FullChallengeResult} from "../../../src/lib/prop/professionalPropEngine.ts";
export const PROFESSIONAL_PROP_RULE_COVERAGE=Object.freeze({supported:["profit_targets_and_stages","daily_drawdown","overall_drawdown","static_initial_balance","trailing_current_balance_or_equity","balance_or_equity_basis","iana_timezone_reset","dst_zone_database","minimum_trading_days","declared_commission_swap_fees"],unsupported:["news_blackout_without_timestamped_news_dataset","consistency_rule_without_firm_formula","exposure_rule_without_intratrade_position_snapshots","payout_eligibility"]} as const);
type CampaignInput={profile:PropProgramProfile;config:PropAccountConfiguration;trades:readonly HistoricalTradeEvidence[];configurationHash:string;unsupportedRequirements?:readonly string[]};
export function prepareProfessionalPropCampaign(input:CampaignInput){
 const unsupported=[...(input.unsupportedRequirements??[])];
 if(input.profile.rules.dstBehavior==="PENDING_VERIFICATION")unsupported.push("dst_behavior_pending_verification");
 if(input.profile.verificationStatus==="PENDING_VERIFICATION"||input.profile.verificationStatus==="STALE")unsupported.push("profile_not_verified");
 const windows=buildChallengeWindows(input.trades,100,"ROLLING_WINDOWS",60,20261003);
 if(windows.length!==100)unsupported.push("insufficient_starting_windows");
 return {windows,unsupported:[...new Set(unsupported)]};
}
export function summarizeProfessionalPropCampaign(windows:readonly ChallengeWindow[],unsupported:readonly string[],results:readonly {window:ChallengeWindow;result:FullChallengeResult}[],configurationHash:string){
 const challenge=unsupported.length?null:summarizeFullChallengeWindows(results,configurationHash);
 const status=!challenge||challenge.incompleteCount?'INCOMPLETE' as const:challenge.passCount===100?'PASS' as const:'FAIL' as const;
 return {status,coverage:PROFESSIONAL_PROP_RULE_COVERAGE,unsupported,windows,challenge,overlapDisclosure:'ROLLING WINDOWS MAY OVERLAP AND ARE NOT INDEPENDENT'};
}
export function runProfessionalPropCampaign(input:CampaignInput){const {windows,unsupported}=prepareProfessionalPropCampaign(input);const challenge=unsupported.length?null:simulateFullChallengeWindows(input.profile,input.config,windows,input.configurationHash);return summarizeProfessionalPropCampaign(windows,unsupported,challenge?.results??[],input.configurationHash);}
