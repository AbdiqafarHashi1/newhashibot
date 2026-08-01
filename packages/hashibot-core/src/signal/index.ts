import { freeze, type DeepReadonly, type Direction, type Evidence } from "../shared.ts";
export interface SignalDraft {signalId:string;symbol:string;market:"crypto"|"forex";timeframe:string;direction:Direction;strategyIdentity:string;strategyVersion:string;createdAt:string;expiresAt:string|null;evidence:readonly Evidence[];payload:Readonly<Record<string,unknown>>;}
export interface ImmutableSignal extends SignalDraft {schemaVersion:1;truthVersion:1;lifecycle:"CREATED";}
export function createSignal(draft:SignalDraft):DeepReadonly<ImmutableSignal>{
  if(!draft.signalId||!draft.symbol||!draft.strategyIdentity||!Number.isFinite(Date.parse(draft.createdAt))||(draft.expiresAt!==null&&!Number.isFinite(Date.parse(draft.expiresAt))))throw new Error("INVALID_SIGNAL_DRAFT");
  return freeze({...draft,symbol:draft.symbol.toUpperCase(),schemaVersion:1 as const,truthVersion:1 as const,lifecycle:"CREATED" as const,evidence:[...draft.evidence],payload:{...draft.payload}});
}
export interface SignalTruthPort {create(signal:DeepReadonly<ImmutableSignal>):Promise<{created:boolean;truthVersion:number}>;}
