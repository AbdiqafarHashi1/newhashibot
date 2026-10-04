import { evaluateCertificationPreflight, type PreflightContext, type CertificationStatus } from "./customer-001-phase-g-certification.ts";

export type OperationsAction = "START_CERTIFICATION"|"STOP_NEW_ENTRIES"|"REQUEST_RECONCILIATION"|"REVOKE_CONNECTION"|"REQUEST_PROTECTION_RECOVERY"|"REQUEST_SAFETY_CLOSE"|"RETRY_SAFE_WORK";
export type AccountOperationsSnapshot = {
  customerId:string; accountId:string; provider:"MT5_PERSONAL"|"MT5_PROP"|"BINANCE"|"BYBIT";
  environment:"DEMO"|"TESTNET"|"LIVE"; ownershipVerified:boolean; connectionVerified:boolean;
  heartbeatState:"HEALTHY"|"STALE"|"MISSING"; entitlement:"ACTIVE"|"TRIAL"|"GRACE"|"MISSING"|"SUSPENDED";
  ownerTestAuthorization:boolean; stopNewEntries:boolean; protectionEnabled:boolean; submissionUncertain:boolean;
  openProtectionIncident:boolean; certificationStatus:CertificationStatus|"REQUIRED";
};
export interface OperationsStore {
  loadAccount(accountId:string):Promise<AccountOperationsSnapshot|null>;
  appendCommand(command:{customerId:string;accountId:string;action:OperationsAction;idempotencyKey:string;safePayload:Record<string,unknown>}):Promise<{id:string;duplicate:boolean}>;
  loadCommand(commandId:string):Promise<{id:string;status:string;safeError:string|null}|null>;
  createCertification?(input:{account:AccountOperationsSnapshot;preflight:PreflightContext;checks:ReturnType<typeof evaluateCertificationPreflight>["checks"]}):Promise<string>;
}
export type Actor={id:string;admin:boolean};

const sandbox=(a:AccountOperationsSnapshot)=>a.environment===(a.provider==="BINANCE"?"TESTNET":"DEMO");
const entitled=(a:AccountOperationsSnapshot)=>["ACTIVE","TRIAL","GRACE"].includes(a.entitlement)||a.ownerTestAuthorization;
/** Authenticated coordinator only. Commands are consumed by the existing E/F workers; this module is not an executor. */
export class PhaseNOperationsService {
  constructor(private store:OperationsStore){}
  async inspect(actor:Actor, customerId:string, accountId:string){
    const account=await this.owned(actor,customerId,accountId); return Object.freeze({...account,nextAction:nextAction(account)});
  }
  async command(actor:Actor,input:{customerId:string;accountId:string;action:OperationsAction;idempotencyKey:string;preflight?:PreflightContext;executionPlan?:Record<string,unknown>;retryCommandId?:string}){
    if(!actor.admin)throw new Error("ADMIN_AUTHORIZATION_REQUIRED");
    if(!input.idempotencyKey)throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const account=await this.owned(actor,input.customerId,input.accountId);
    if(input.action==="START_CERTIFICATION"){
      if(!sandbox(account))throw new Error("SANDBOX_ENVIRONMENT_REQUIRED");
      if(!account.ownershipVerified||!account.connectionVerified||account.heartbeatState!=="HEALTHY")throw new Error("CURRENT_PROVIDER_IDENTITY_REQUIRED");
      if(!entitled(account))throw new Error("ENTITLEMENT_OR_OWNER_TEST_AUTHORIZATION_REQUIRED");
      if(!input.preflight)throw new Error("CANONICAL_PREFLIGHT_REQUIRED");
      if(!input.executionPlan)throw new Error("IMMUTABLE_EXECUTION_PLAN_REQUIRED");
      const result=evaluateCertificationPreflight(input.preflight); if(!result.passed)throw new Error(`PREFLIGHT_BLOCKED:${result.reasonCodes.join(",")}`);
    }
    if(input.action==="STOP_NEW_ENTRIES"&&!account.protectionEnabled)throw new Error("PROTECTION_MUST_REMAIN_ENABLED");
    if(input.action==="RETRY_SAFE_WORK"){
      if(!input.retryCommandId)throw new Error("RETRY_EVIDENCE_REQUIRED"); const prior=await this.store.loadCommand(input.retryCommandId);
      if(!prior||prior.status!=="FAILED_SAFE_RETRY"||account.submissionUncertain)throw new Error("RETRY_NOT_PROVEN_SAFE");
    }
    if(account.submissionUncertain&&!['REQUEST_RECONCILIATION','STOP_NEW_ENTRIES'].includes(input.action))throw new Error("RECONCILIATION_REQUIRED");
    if(["REQUEST_PROTECTION_RECOVERY","REQUEST_SAFETY_CLOSE"].includes(input.action)&&!account.openProtectionIncident)throw new Error("PROTECTION_INCIDENT_EVIDENCE_REQUIRED");
    const certificationRunId=input.action==="START_CERTIFICATION"?await this.store.createCertification?.({account,preflight:input.preflight!,checks:evaluateCertificationPreflight(input.preflight!).checks}):undefined;
    if(input.action==="START_CERTIFICATION"&&!certificationRunId)throw new Error("CERTIFICATION_STORE_UNAVAILABLE");
    const safePayload={retryCommandId:input.retryCommandId??null,certificationRunId:certificationRunId??null,preflightPassed:input.action==="START_CERTIFICATION",executionPlan:input.executionPlan??null};
    return this.store.appendCommand({customerId:account.customerId,accountId:account.accountId,action:input.action,idempotencyKey:input.idempotencyKey,safePayload});
  }
  private async owned(actor:Actor,customerId:string,accountId:string){
    if(!customerId||!accountId)throw new Error("EXPLICIT_CUSTOMER_AND_ACCOUNT_REQUIRED");
    const account=await this.store.loadAccount(accountId); if(!account||account.customerId!==customerId)throw new Error("ACCOUNT_OWNERSHIP_REQUIRED");
    if(!actor.admin&&actor.id!==customerId)throw new Error("CUSTOMER_ACCESS_DENIED"); return account;
  }
}

export type ClaimedOperationsCommand={id:string;customerId:string;accountId:string;action:OperationsAction;safePayload:Record<string,unknown>;leaseToken:string};
export interface OperationsConsumerStore extends OperationsStore { claim(workerId:string,leaseMs:number):Promise<ClaimedOperationsCommand|null>; complete(id:string,leaseToken:string,result:Record<string,unknown>):Promise<void>; fail(id:string,leaseToken:string,error:string,retryable:boolean):Promise<void>; }
export interface ExistingAuthorityDispatcher { dispatch(command:ClaimedOperationsCommand,account:AccountOperationsSnapshot):Promise<Record<string,unknown>>; }
/** Durable consumer. It re-loads ownership/authorization at consumption time and delegates; it never submits an order itself. */
export class PhaseNCommandConsumer{
 constructor(private store:OperationsConsumerStore,private dispatcher:ExistingAuthorityDispatcher){}
 async work(workerId:string,leaseMs=30_000){const command=await this.store.claim(workerId,leaseMs);if(!command)return{state:"IDLE" as const};try{const account=await this.store.loadAccount(command.accountId);if(!account||account.customerId!==command.customerId)throw new Error("STALE_ACCOUNT_OWNERSHIP");if(!sandbox(account))throw new Error("STALE_SANDBOX_AUTHORIZATION");if(command.action==="START_CERTIFICATION"&&(!account.ownershipVerified||!account.connectionVerified||account.heartbeatState!=="HEALTHY"||!entitled(account)))throw new Error("STALE_CERTIFICATION_AUTHORIZATION");if(command.action==="STOP_NEW_ENTRIES"&&!account.protectionEnabled)throw new Error("PROTECTION_MUST_REMAIN_ENABLED");if(account.submissionUncertain&&!['REQUEST_RECONCILIATION','STOP_NEW_ENTRIES'].includes(command.action))throw new Error("RECONCILIATION_REQUIRED");if(["REQUEST_PROTECTION_RECOVERY","REQUEST_SAFETY_CLOSE"].includes(command.action)&&!account.openProtectionIncident)throw new Error("PROTECTION_INCIDENT_EVIDENCE_REQUIRED");const result=await this.dispatcher.dispatch(command,account);await this.store.complete(command.id,command.leaseToken,result);return{state:"COMPLETED" as const,id:command.id,result}}catch(e){const code=e instanceof Error?e.message:"SAFE_CONSUMER_FAILURE";await this.store.fail(command.id,command.leaseToken,code,["AUTHORITY_TEMPORARILY_UNAVAILABLE","DATABASE_TEMPORARILY_UNAVAILABLE"].includes(code));return{state:"FAILED" as const,id:command.id,error:code}}}
}
export function nextAction(a:AccountOperationsSnapshot){
  if(!a.ownershipVerified)return "VERIFY_ACCOUNT_OWNERSHIP"; if(!sandbox(a))return "CONFIGURE_DEMO_ENVIRONMENT";
  if(!a.connectionVerified)return "CONNECT_PROVIDER"; if(a.heartbeatState!=="HEALTHY")return "RESTORE_PROVIDER_HEALTH";
  if(!entitled(a))return "ACTIVATE_ACCOUNT_ENTITLEMENT"; if(a.submissionUncertain)return "REQUEST_RECONCILIATION";
  if(a.openProtectionIncident)return "REQUEST_PROTECTION_RECOVERY"; if(a.certificationStatus!=="PASSED")return "RUN_DEMO_CERTIFICATION"; return "NO_ACTION_REQUIRED";
}
