export type DeepReadonly<T> = T extends (...args: never[])=>unknown ? T : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type Direction = "BUY"|"SELL";
export type KnownState = "KNOWN"|"UNKNOWN"|"STALE"|"UNAVAILABLE";
export interface Evidence { code:string; message:string; values?:Readonly<Record<string,string|number|boolean|null>>; }
export interface VersionedIdentity { identity:string; version:string; schemaVersion:number; }
export interface Correlation { correlationId:string; causationId:string|null; }
export function freeze<T>(value:T):DeepReadonly<T>{
  if(value!==null&&typeof value==="object"&&!Object.isFrozen(value)){
    for(const nested of Object.values(value as Record<string,unknown>))freeze(nested);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
