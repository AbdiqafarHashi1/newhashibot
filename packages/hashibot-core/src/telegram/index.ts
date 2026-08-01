export * from "../../../../supabase/functions/_shared/telegram-content-contracts.ts";
export type TelegramEvent="SIGNAL_CREATED"|"SIGNAL_QUALIFIED"|"TRADE_OPENED"|"TRADE_PROTECTED"|"TP1_HIT"|"TP2_HIT"|"TRADE_CLOSED"|"RECOVERY_TRIGGERED"|"PROVIDER_DISCONNECTED"|"PROVIDER_RECOVERED";
export interface TelegramRoute {audience:"FREE"|"VIP"|"ADMIN";channelKey:string;templateKey:string;}
export interface TelegramMessageIntent {deliveryId:string;event:TelegramEvent;correlationId:string;signalId:string|null;tradeId:string|null;route:TelegramRoute;variables:Readonly<Record<string,string|number|boolean|null>>;}
export interface TelegramDeliveryPort {send(intent:TelegramMessageIntent):Promise<{status:"SENT"|"SKIPPED"|"FAILED";providerMessageId:string|null;reason:string|null}>;}
