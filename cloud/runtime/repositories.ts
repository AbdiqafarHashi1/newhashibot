import type { DemoAccount, ExecutionCommand, ProviderReceipt, RuntimeEvent } from "./types.ts";
export interface VersionedResult<T>{ok:boolean;value:T|null;errorCode:string|null;}
export interface ApprovedSignalRepository{append(signal:Record<string,unknown>,correlationId:string):Promise<VersionedResult<RuntimeEvent>>;}
export interface ScannerConfigurationRepository{load(correlationId:string):Promise<VersionedResult<{enabled:boolean;symbols:readonly string[];timeframes:readonly string[]}>>;}
export interface AccountConfigurationRepository{load(accountId:string,correlationId:string):Promise<VersionedResult<DemoAccount>>;}
export type AccountStateRepository=AccountConfigurationRepository;
export interface PortfolioStateRepository{load(accountId:string,correlationId:string):Promise<VersionedResult<{openRiskPct:number}>>;}
export interface RuntimeControlRepository{load(correlationId:string):Promise<VersionedResult<{running:boolean;entriesPaused:boolean;version:number}>>;}
export interface RuntimeEventRepository{append(event:RuntimeEvent,expectedVersion:number):Promise<VersionedResult<RuntimeEvent>>;list(correlationId:string):readonly RuntimeEvent[];}
export interface ExecutionCommandRepository{append(command:ExecutionCommand):Promise<VersionedResult<ExecutionCommand>>;}
export interface ProviderResultRepository{append(result:ProviderReceipt):Promise<VersionedResult<ProviderReceipt>>;}
export type TradeTruthRepository=RuntimeEventRepository;
export type ProtectionEvidenceRepository=RuntimeEventRepository;
export type RecoveryRepository=RuntimeEventRepository;
export interface TelegramDeliveryRepository{claim(deliveryId:string):Promise<"CLAIMED"|"DUPLICATE">;}
export interface ProviderHealthRepository{load(provider:string,correlationId:string):Promise<VersionedResult<{healthy:boolean}>>;}
export type CertificationRepository=RuntimeEventRepository;

export class InMemoryRuntimeStore implements RuntimeEventRepository,TradeTruthRepository,ProtectionEvidenceRepository,RecoveryRepository,CertificationRepository,TelegramDeliveryRepository,ExecutionCommandRepository,ProviderResultRepository{
  private events:RuntimeEvent[]=[];private deliveries=new Set<string>();private commands=new Map<string,ExecutionCommand>();private results=new Map<string,ProviderReceipt>();
  async append(value:RuntimeEvent,expectedVersion?:number):Promise<VersionedResult<RuntimeEvent>>;
  async append(value:ExecutionCommand):Promise<VersionedResult<ExecutionCommand>>;
  async append(value:ProviderReceipt):Promise<VersionedResult<ProviderReceipt>>;
  async append(value:RuntimeEvent|ExecutionCommand|ProviderReceipt,expectedVersion=0):Promise<VersionedResult<RuntimeEvent|ExecutionCommand|ProviderReceipt>>{
    if("eventId" in value){const prior=this.events.find(x=>x.eventId===value.eventId);if(prior)return{ok:true,value:prior,errorCode:"DUPLICATE"};const version=this.events.filter(x=>x.aggregateId===value.aggregateId).length;if(version!==expectedVersion)return{ok:false,value:null,errorCode:"STALE_VERSION"};this.events.push(value);return{ok:true,value,errorCode:null};}
    if("idempotencyKey" in value){const prior=this.commands.get(value.idempotencyKey);if(prior)return{ok:true,value:prior,errorCode:"DUPLICATE"};this.commands.set(value.idempotencyKey,value);return{ok:true,value,errorCode:null};}
    const prior=this.results.get(value.commandId);if(prior)return{ok:true,value:prior,errorCode:"DUPLICATE"};this.results.set(value.commandId,value);return{ok:true,value,errorCode:null};
  }
  list(correlationId:string){return this.events.filter(x=>x.correlationId===correlationId);}
  async claim(id:string){if(this.deliveries.has(id))return"DUPLICATE" as const;this.deliveries.add(id);return"CLAIMED" as const;}
}
