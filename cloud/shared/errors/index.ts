import { normalizeError } from "../logging/index.ts";
export class SafeRuntimeError extends Error {
  constructor(public readonly code:string,message:string,public readonly retryable=false){super(message);this.name="SafeRuntimeError";}
  toSafeLog(){return {...normalizeError(this),error_code:this.code,retryable:this.retryable};}
}
