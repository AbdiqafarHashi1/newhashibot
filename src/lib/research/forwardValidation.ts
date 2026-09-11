import type { QualifiedStrategySet } from "./strategyQualification";

export interface FrozenForwardConfiguration { version:"qualified-forward-config/v1";strategyId:string;strategyVersion:string;configId:string;configVersion:string;strategyParameters:Readonly<Record<string,unknown>>;symbols:readonly string[];timeframes:readonly string[];qualifiedSetVersion:string;immutable:true;propProfileId:string|null;researchEvidence:unknown }
export function startForwardValidation(input:{frozen:FrozenForwardConfiguration;qualifiedSet:QualifiedStrategySet;account:{accountId:string;product:string;providerCertificationStatus:string;active:boolean};startedAt:string}){
  const entry=input.qualifiedSet.entries.find(e=>e.strategyId===input.frozen.strategyId&&e.strategyVersion===input.frozen.strategyVersion&&e.configId===input.frozen.configId&&e.configVersion===input.frozen.configVersion);
  const reasons:string[]=[];
  if(!input.frozen.immutable)reasons.push("FORWARD_CONFIG_NOT_IMMUTABLE");
  if(input.qualifiedSet.setVersion!==input.frozen.qualifiedSetVersion)reasons.push("QUALIFIED_SET_VERSION_MISMATCH");
  if(!entry)reasons.push("QUALIFIED_CONFIG_NOT_FOUND");
  else if(JSON.stringify(entry.strategyParameters)!==JSON.stringify(input.frozen.strategyParameters))reasons.push("PINNED_PARAMETERS_MISMATCH");
  if(!input.account.active)reasons.push("EXECUTION_ACCOUNT_NOT_ACTIVE");
  if(input.account.providerCertificationStatus!=="CERTIFIED")reasons.push("PROVIDER_NOT_CERTIFIED");
  const core={version:"forward-validation-run/v1" as const,status:reasons.length?"BLOCKED" as const:"READY" as const,reasonCodes:Object.freeze(reasons),accountId:input.account.accountId,product:input.account.product,startedAt:new Date(input.startedAt).toISOString(),qualifiedSetVersion:input.frozen.qualifiedSetVersion,strategyId:input.frozen.strategyId,strategyVersion:input.frozen.strategyVersion,configId:input.frozen.configId,configVersion:input.frozen.configVersion,strategyParameters:Object.freeze({...input.frozen.strategyParameters}),symbols:Object.freeze([...input.frozen.symbols]),timeframes:Object.freeze([...input.frozen.timeframes]),researchEvidence:input.frozen.researchEvidence};
  return Object.freeze(core);
}
