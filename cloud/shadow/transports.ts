export interface ReadOnlyProviderTransport {readonly provider:"BINANCE_TESTNET"|"BYBIT_DEMO";readAccount():Promise<unknown>;readPositions():Promise<unknown>;readOrders():Promise<unknown>;readInstruments():Promise<unknown>;sanitizeIntendedRequest(value:Readonly<Record<string,unknown>>):Readonly<Record<string,unknown>>;}
export interface TelegramShadowTransport {preview(message:string):Promise<{preview:string;sent:false}>;sendCertificationSummary(message:string):Promise<{sent:true;destination:"PRIVATE_ADMIN_TEST"}>;}
export const shadowTelegramMessage=(body:string)=>`SHADOW / DEMO CERTIFICATION\n${body}`;
// There is intentionally no submit/cancel/close/modify method on either transport.
