export interface LossResponsePolicy {
 readonly version:'loss-response/v1'; readonly reduceAfterLosses:number; readonly pauseAfterLosses:number;
 readonly pauseMinutes:number; readonly reducedRiskMultiplier:number; readonly drawdownReducePct:number; readonly maxEvidenceAgeMs:number;
}
export interface AccountPerformanceEvidence {
 readonly customerId:string;readonly accountId:string;readonly provider:string;readonly asOf:string;
 readonly source:'CANONICAL_PROVIDER'|'ISOLATED_REPLAY';readonly closedTradeCount:number;readonly consecutiveLosses:number;readonly lastLossAt:string|null;
}
/** A versioned Phase-D cap, never a second sizing engine or an autonomous risk escalator. */
export function accountPerformanceGate(input:{policy?:LossResponsePolicy; evidence?:AccountPerformanceEvidence;customerId:string;accountId:string;provider:string;evaluatedAt:string;dailyDrawdownPct:number}) {
 if(!input.policy)return {riskMultiplier:1,reasonCodes:[] as string[],blocked:false};
 const p=input.policy,now=Date.parse(input.evaluatedAt),e=input.evidence;
 if(p.version!=='loss-response/v1'||!Number.isInteger(p.reduceAfterLosses)||p.reduceAfterLosses<1||!Number.isInteger(p.pauseAfterLosses)||p.pauseAfterLosses<p.reduceAfterLosses||p.pauseAfterLosses>20||!Number.isFinite(p.pauseMinutes)||p.pauseMinutes<1||p.pauseMinutes>10080||!Number.isFinite(p.reducedRiskMultiplier)||p.reducedRiskMultiplier<=0||p.reducedRiskMultiplier>1||!Number.isFinite(p.drawdownReducePct)||p.drawdownReducePct<=0||!Number.isFinite(p.maxEvidenceAgeMs)||p.maxEvidenceAgeMs<1000||p.maxEvidenceAgeMs>86400000)throw new Error('INVALID_LOSS_RESPONSE_POLICY');
 const blocked=(reason:string)=>({riskMultiplier:0,reasonCodes:[reason],blocked:true});
 if(!e)return blocked('ACCOUNT_PERFORMANCE_EVIDENCE_REQUIRED');
 if(e.customerId!==input.customerId||e.accountId!==input.accountId||e.provider!==input.provider)return blocked('ACCOUNT_PERFORMANCE_SCOPE_MISMATCH');
 const at=Date.parse(e.asOf);if(!Number.isFinite(now)||!Number.isFinite(at)||at>now||now-at>p.maxEvidenceAgeMs||!Number.isFinite(input.dailyDrawdownPct))return blocked('ACCOUNT_PERFORMANCE_STALE_OR_INVALID');
 if(!['CANONICAL_PROVIDER','ISOLATED_REPLAY'].includes(e.source)||!Number.isInteger(e.closedTradeCount)||!Number.isInteger(e.consecutiveLosses)||e.closedTradeCount<0||e.consecutiveLosses<0||e.consecutiveLosses>e.closedTradeCount)return blocked('ACCOUNT_PERFORMANCE_INVALID');
 const loss=e.lastLossAt===null?null:Date.parse(e.lastLossAt);if(e.consecutiveLosses>0&&(loss===null||!Number.isFinite(loss)||loss>now))return blocked('LOSS_TIMESTAMP_REQUIRED');
 if(e.consecutiveLosses>=p.pauseAfterLosses&&loss!==null&&now<loss+p.pauseMinutes*60000)return blocked('LOSS_STREAK_COOLDOWN');
 if(e.consecutiveLosses>=p.reduceAfterLosses||input.dailyDrawdownPct>=p.drawdownReducePct)return {riskMultiplier:p.reducedRiskMultiplier,reasonCodes:['DEFENSIVE_RISK_CAP'],blocked:false};
 return {riskMultiplier:1,reasonCodes:['APPROVED_BASELINE_RISK'],blocked:false};
}
