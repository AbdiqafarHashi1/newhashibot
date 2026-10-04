export interface CertificationDispatchTransport{dispatch(input:{provider:string;accountId:string;plan:Record<string,unknown>;idempotencyKey:string}):Promise<{accepted:boolean;canonicalId?:string;state:string}>}
/** Disabled-by-default adapter into existing Phase E/F boundaries. */
export async function dispatchPhaseNCertification(input:{enabled:boolean;provider:string;accountId:string;plan:Record<string,unknown>|null;idempotencyKey:string;transport:CertificationDispatchTransport}){
 if(!input.enabled)throw new Error("CERTIFICATION_DEMO_DISPATCH_DISABLED");if(!input.plan)throw new Error("IMMUTABLE_EXECUTION_PLAN_REQUIRED");
 const routing=input.plan.routing as Record<string,unknown>|undefined,risk=input.plan.risk_decision as Record<string,unknown>|undefined;
 if(input.plan.schema_version!=="execution-plan/v1"||input.plan.status!=="PLANNED"||!routing||!risk)throw new Error("EXECUTION_PLAN_V1_REQUIRED");
 if(String(routing.account_id)!==input.accountId)throw new Error("EXECUTION_PLAN_ACCOUNT_MISMATCH");
 if(!["ACCEPT","REDUCE"].includes(String(risk.decision))||!risk.decision_id||(risk.authorized_envelope as Record<string,unknown>|null)?.policy_version==null)throw new Error("CANONICAL_DECISION_LINEAGE_REQUIRED");
 const result=await input.transport.dispatch({provider:input.provider,accountId:input.accountId,plan:input.plan,idempotencyKey:input.idempotencyKey});if(!result.accepted)throw new Error(`CERTIFICATION_DISPATCH_REJECTED:${result.state}`);return Object.freeze(result);
}
