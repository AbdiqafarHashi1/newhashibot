/** Read-only server evidence projections; these types never confer qualification or execution authority. */
export interface RecordedRun {
 id:string;status:string;progress_completed?:number;dataset_hash?:string;configuration_hash?:string;source_run_id?:string;
 provenance?:{start?:string};immutable_configuration?:{researchOnly?:boolean;strategies:{id:string}[]};outcome_assumptions?:{feeBps:number;spreadBps:number;slippageBps:number;fundingBps:number};
 outcome_metrics?:Record<string,unknown>&{overall?:{tradeCount?:number}};result_summary?:Record<string,unknown>&{overall?:Record<string,unknown>};failure_code?:string;
}
export interface TrialEvidence {
 window?:{start?:string;startTime?:string;from?:string;end?:string;endTime?:string;to?:string};
 result?:{status?:string;state?:string;finalState?:string;reasonCodes?:string[];reason?:string;failureReason?:string;phase1?:{reasonCodes?:string[]};verification?:{reasonCodes?:string[]}};
}
export interface EvidenceRow extends TrialEvidence {payload?:TrialEvidence;evidence?:TrialEvidence;data?:TrialEvidence;[key:string]:unknown}
export interface ValidationDetails {run:RecordedRun;evidence?:EvidenceRow[];outcomes?:Record<string,unknown>[]}
export interface ValidationAuthorities {
 accounts:{id:string;display_label:string}[];
 brains:{id:string;execution_account_id:string;brain_family:string;policy_version:string}[];
 props:{id:string;profile_id:string;profile_version:string}[];
}
export interface MeasuredRelease {id:string;strategy_id:string;state:string;validation_run_id:string;holdout_run_id?:string;configuration_hash:string}
