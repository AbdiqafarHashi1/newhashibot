export type CertifiableProvider = "MT5" | "BINANCE" | "BYBIT";
export type ProviderCapability = "AUTHENTICATION" | "HISTORICAL_DATA" | "CURRENT_MARKET_DATA" | "SYMBOL_AVAILABILITY" | "EXECUTION";
export interface ProviderCapabilityEvidence { capability: ProviderCapability; verified: boolean; externallyUnavailable?: boolean; reason?: string }
export interface ProviderCertificationInput { provider: CertifiableProvider; accountId: string; requiredSymbols: readonly string[]; executionRequired: boolean; evidence: readonly ProviderCapabilityEvidence[] }
export function certifyProvider(input:ProviderCertificationInput){
  const required:ProviderCapability[]=["AUTHENTICATION","HISTORICAL_DATA","CURRENT_MARKET_DATA","SYMBOL_AVAILABILITY",...(input.executionRequired?["EXECUTION" as const]:[])];
  const missing=required.filter(cap=>!input.evidence.some(item=>item.capability===cap&&item.verified));
  const external=missing.some(cap=>input.evidence.some(item=>item.capability===cap&&item.externallyUnavailable));
  const reasons=missing.map(cap=>`${cap}_${input.evidence.some(item=>item.capability===cap&&item.externallyUnavailable)?"EXTERNAL_VERIFICATION_REQUIRED":"NOT_VERIFIED"}`);
  return Object.freeze({version:"provider-certification/v1" as const,provider:input.provider,accountId:input.accountId,symbols:Object.freeze([...input.requiredSymbols]),status:missing.length?(external?"EXTERNAL_VERIFICATION_REQUIRED":"INCOMPLETE"):"CERTIFIED" as "CERTIFIED"|"INCOMPLETE"|"EXTERNAL_VERIFICATION_REQUIRED",reasonCodes:Object.freeze(reasons),capabilities:Object.freeze(required.map(capability=>({capability,verified:!missing.includes(capability)})))});
}
