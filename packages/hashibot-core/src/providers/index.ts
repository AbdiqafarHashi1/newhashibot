import type { Correlation, Direction, KnownState } from "../shared.ts";
export type ProviderIdentity="BINANCE"|"BYBIT"|"MT5";
export interface ProviderCapabilities {provider:ProviderIdentity;marketOrders:boolean;limitOrders:boolean;nativeStop:boolean;nativeTakeProfit:boolean;partialExit:boolean;trailing:boolean;}
export interface ProviderOrderIntent extends Correlation {provider:ProviderIdentity;accountId:string;executionScopeKey:string;idempotencyKey:string;symbol:string;direction:Direction;quantity:number;orderType:"MARKET"|"LIMIT"|"STOP"|"TAKE_PROFIT";price:number|null;reduceOnly:boolean;}
export interface ProviderOrderEvidence {provider:ProviderIdentity;providerOrderId:string;clientOrderId:string;state:KnownState;observedAt:string;rawReference:string|null;}
export interface ProviderReadPort {capabilities():ProviderCapabilities;lookupOrder(clientOrderId:string,correlation:Correlation):Promise<ProviderOrderEvidence|null>;}
export interface ProviderMutationPort extends ProviderReadPort {submit(intent:ProviderOrderIntent):Promise<ProviderOrderEvidence>;cancel(providerOrderId:string,context:Correlation&{idempotencyKey:string}):Promise<ProviderOrderEvidence>;}
export interface BinanceProviderPort extends ProviderMutationPort {capabilities():ProviderCapabilities&{provider:"BINANCE"};}
export interface BybitProviderPort extends ProviderMutationPort {capabilities():ProviderCapabilities&{provider:"BYBIT"};}
export interface MT5ProviderPort extends ProviderMutationPort {capabilities():ProviderCapabilities&{provider:"MT5"};}
