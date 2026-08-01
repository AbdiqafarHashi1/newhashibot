import type { ProviderIdentity } from "../../packages/hashibot-core/src/providers/index.ts";
export type DemoRoute="BINANCE_PERSONAL_DEMO"|"BYBIT_PERSONAL_DEMO"|"MT5_PERSONAL_DEMO"|"MT5_PROP_DEMO";
export type RuntimeStage="MARKET"|"SCANNER"|"STRATEGY"|"ARBITRATOR"|"SIGNAL"|"BRAIN"|"RISK"|"CAPITAL"|"PROVIDER_VALIDATION"|"EXECUTION"|"TRADE"|"PROTECTION"|"RECOVERY"|"TELEGRAM";
export interface Receipt {receiptId:string;correlationId:string;stage:RuntimeStage;outcome:"ACCEPTED"|"REJECTED"|"COMPLETED"|"RECOVERY_REQUIRED";at:string;evidence:readonly string[];durationMs:number;}
export interface DemoAccount {accountId:string;route:DemoRoute;provider:ProviderIdentity;locked:boolean;balance:number;freeMargin:number;maxRiskPct:number;quantityStep:number;tickSize:number;minimumNotional:number;}
export interface ExecutionCommand {commandId:string;correlationId:string;idempotencyKey:string;accountId:string;provider:ProviderIdentity;symbol:string;side:"BUY"|"SELL";quantity:number;entry:number;stop:number;tp1:number;tp2:number;mutationAuthorized:false;}
export interface ProviderReceipt {commandId:string;provider:ProviderIdentity;status:"FILLED"|"REJECTED"|"UNKNOWN"|"DUPLICATE";providerOrderId:string|null;fillPrice:number|null;reason:string|null;at:string;}
export interface RuntimeEvent {eventId:string;type:string;correlationId:string;aggregateId:string;version:number;at:string;payload:Readonly<Record<string,unknown>>;}
export interface DemoResult {scenario:string;route:DemoRoute;correlationId:string;outcome:"CLOSED"|"NO_TRADE"|"REJECTED"|"RECOVERY_REQUIRED";receipts:readonly Receipt[];events:readonly RuntimeEvent[];providerReceipt:ProviderReceipt|null;telegramReceipts:readonly {deliveryId:string;status:"SENT"|"DUPLICATE"}[];capitalCalls:number;}
