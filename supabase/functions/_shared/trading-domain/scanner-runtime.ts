import { arbitrateCanonical } from "./arbitrator.ts";
import { buildCanonicalMarketView } from "./market-view.ts";
import { resolveCanonicalStrategyParameters, strategyById } from "./strategies.ts";
import type { ArbitrationDecision, Candidate, CanonicalSignal, DomainCandle, StrategyEvaluation } from "./contracts.ts";

export const CANONICAL_SCANNER_AUTHORITY = "trading-domain.scanner-runtime/v1" as const;
export interface ScannerStrategyIdentity {strategyId:string;strategyVersion:string;configurationVersion:string;parameters:Readonly<Record<string,number>>}
export interface CanonicalScannerInput {symbol:string;asOf:string;datasets:Readonly<Record<string,readonly DomainCandle[]>>;strategies:readonly {strategyId:string;configurationVersion:string;parameters?:Readonly<Record<string,number>>}[];minimumScore:number;blockedSymbols?:readonly string[];session:{open:boolean;code:string}}
export interface CanonicalScannerResult {version:"canonical-scanner-result/v1";authority:typeof CANONICAL_SCANNER_AUTHORITY;asOf:string;identities:readonly ScannerStrategyIdentity[];evaluations:readonly StrategyEvaluation[];candidates:readonly Candidate[];arbitration:ArbitrationDecision;signal:CanonicalSignal|null;outcome:"SIGNAL"|"NO_TRADE"}

function stable(value:unknown):string {if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;}
function id(value:unknown){let h=2166136261;for(const c of stable(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return `signal_${(h>>>0).toString(16).padStart(8,"0")}`;}
function immutable<T>(value:T):T {if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(const child of Object.values(value as Record<string,unknown>))immutable(child);Object.freeze(value);}return value;}
export function materializeCanonicalSignal(arbitration:ArbitrationDecision,asOf:string):CanonicalSignal|null {const chosen=arbitration.chosen;return chosen?immutable<CanonicalSignal>({version:"canonical-signal/v1",id:id({candidateId:chosen.id,arbitration,asOf}),candidateId:chosen.id,decisionTimestamp:asOf,symbol:chosen.symbol,timeframe:chosen.primaryTimeframe,side:chosen.side,entry:chosen.entry,stop:chosen.stop,targets:[...chosen.targets],strategy:{id:chosen.strategyId,version:chosen.strategyVersion,configurationVersion:chosen.configurationVersion},evidence:chosen.evidence,arbitration:{authority:"trading-domain.arbitrateCanonical",version:arbitration.version,reasonCodes:[],rejected:arbitration.rejected}}):null;}

/** Production scanner entry point. Market view construction, indicators and
 * strategy evaluation deliberately remain in their canonical domain owners. */
export function runCanonicalScanner(input:CanonicalScannerInput):CanonicalScannerResult {
  const identities=input.strategies.map(request=>{const strategy=strategyById(request.strategyId);if(strategy.status!=="CANONICAL")throw new Error(`NON_PRODUCTION_STRATEGY:${strategy.id}`);return {strategyId:strategy.id,strategyVersion:strategy.version,configurationVersion:request.configurationVersion,parameters:resolveCanonicalStrategyParameters(strategy.id,request.parameters)};});
  const evaluations=identities.map(identity=>{const strategy=strategyById(identity.strategyId),market=buildCanonicalMarketView({symbol:input.symbol,asOf:input.asOf,primaryTimeframe:strategy.requirements.primaryTimeframe,requiredTimeframes:strategy.requirements.requiredTimeframes,warmupBars:strategy.requirements.warmupBars,datasets:input.datasets,session:input.session});return strategy.evaluate({market,configurationVersion:identity.configurationVersion,parameters:identity.parameters});});
  const candidates=evaluations.flatMap(e=>e.decision==="CANDIDATE"?[e.candidate]:[]),arbitration=arbitrateCanonical(candidates,{minimumScore:input.minimumScore,blockedSymbols:input.blockedSymbols??[]}),signal=materializeCanonicalSignal(arbitration,input.asOf);
  return immutable({version:"canonical-scanner-result/v1",authority:CANONICAL_SCANNER_AUTHORITY,asOf:input.asOf,identities,evaluations,candidates,arbitration,signal,outcome:signal?"SIGNAL":"NO_TRADE"});
}

export type RuntimeDifferenceCode="DATASET_PROVENANCE"|"DELIVERY_METADATA"|"EXECUTION_ACCOUNT_STATE";
export function classifyRuntimeOnlyDifference(path:string):RuntimeDifferenceCode|null {if(path.includes("datasetId"))return "DATASET_PROVENANCE";if(path.includes("telegram")||path.includes("delivery"))return "DELIVERY_METADATA";if(path.includes("account")||path.includes("execution"))return "EXECUTION_ACCOUNT_STATE";return null;}
