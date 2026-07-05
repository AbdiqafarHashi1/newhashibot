export type BridgeMessageType='BridgeRegister'|'BridgeHeartbeat'|'BridgeCommandReceived'|'BridgeCommandAck'|'BridgeCommandResult'|'BridgePositionSnapshot'|'BridgeAccountSnapshot'|'BridgeSymbolMetadata'|'BridgeError'|'BridgeUpdateAvailable';
export interface BridgeMessage<T extends BridgeMessageType=BridgeMessageType,P=Record<string,unknown>>{messageId:string; type:T; bridgeId:string; occurredAt:string; version:number; payload:P}
export type AgentMessageType='AgentHeartbeat'|'AccountValidated'|'OrderEvent'|'DealEvent'|'PositionEvent'|'ManualModificationDetected'|'ManualCloseDetected'|'BrokerError'|'SymbolMetadata';
export interface AgentMessage<T extends AgentMessageType=AgentMessageType,P=Record<string,unknown>>{messageId:string; type:T; accountId:string; occurredAt:string; payload:P}
