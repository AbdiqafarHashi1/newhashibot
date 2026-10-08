import {parsePortableRequest,type PortableKind} from '../../supabase/functions/_shared/phase-p-contract';

type Storage = Pick<globalThis.Storage,'getItem'|'setItem'>;
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Persist before sending. An uncertain response never rotates the attempt. */
export class PortableSubmissionAttempts {
  private pending=new Map<string,Promise<unknown>>();
  constructor(private storage:Storage,private newKey=()=>crypto.randomUUID()){}
  submit<T>(userId:string,kind:PortableKind,input:Record<string,unknown>,send:(key:string)=>Promise<T>,newRun=false):Promise<T>{
    if(!userId)throw Error('AUTHENTICATION_REQUIRED');
    const normalized=parsePortableRequest({kind,idempotencyKey:'normalize-input',...input}).input;
    const scope=`hashibot:phase-p:attempt:v1:${userId}:${kind}:${canonical(normalized)}`;
    const pending=this.pending.get(scope);if(pending)return pending as Promise<T>;
    // Fail closed if durable browser storage is unavailable; do not send with a lost key.
    let key=this.storage.getItem(scope);
    if(newRun||!key){key=this.newKey();this.storage.setItem(scope,key);}
    const attemptKey=key;
    const promise=Promise.resolve().then(()=>send(attemptKey)).finally(()=>this.pending.delete(scope));
    this.pending.set(scope,promise);return promise;
  }
}
