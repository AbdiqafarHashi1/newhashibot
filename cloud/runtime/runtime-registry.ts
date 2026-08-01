import {arbitrate} from "../../packages/hashibot-core/src/arbitrator/index.ts";
export const runtimeRegistry=Object.freeze({
  portableCore:"@hashibot/core",arbitrator:arbitrate,
  brains:Object.freeze({BINANCE:{provider:"BINANCE",identity:"BinancePersonalBrain",version:"canonical"},BYBIT:{provider:"BYBIT",identity:"BybitPersonalBrain",version:"canonical"},MT5_PERSONAL:{provider:"MT5_PERSONAL",identity:"Mt5PersonalBrain",version:"canonical"},MT5_PROP:{provider:"MT5_PROP",identity:"Mt5PropBrain",version:"canonical"}}),
  riskEngine:"ProfessionalRiskEngine",capitalManager:"ProfessionalCapitalManager",tradeManagement:"UnifiedTradeManagementSupervisor",recovery:"CanonicalRecoveryEngine",
});
export type RuntimeCapability={status:"READY_LOCAL"|"DISABLED"|"REQUIRES_SHADOW";evidence:string};
export const runtimeCapabilities=Object.freeze({decision:{status:"READY_LOCAL",evidence:"runtime-services.test.ts"},execution:{status:"DISABLED",evidence:"deterministic adapter only"},trade:{status:"READY_LOCAL",evidence:"append-first lifecycle fixture"},communications:{status:"READY_LOCAL",evidence:"idempotent demo receipt fixture"},supabase:{status:"REQUIRES_SHADOW",evidence:"interfaces and server boundary; no active binding"}} satisfies Record<string,RuntimeCapability>);
