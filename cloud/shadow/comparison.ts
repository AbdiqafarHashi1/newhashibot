import type {ComparisonStatus} from "./contracts.ts";
export interface ComparisonField {field:string;authoritative:unknown;shadow:unknown;tolerance?:number;required?:boolean;expectedDifference?:boolean;}
export interface ComparisonResult {status:ComparisonStatus;fields:readonly {field:string;status:ComparisonStatus;difference:number|null;explanation:string|null}[];}
export function compareShadow(fields:readonly ComparisonField[]):ComparisonResult{
  const results=fields.map(f=>{if(f.authoritative===undefined||f.shadow===undefined)return{field:f.field,status:(f.required?"BLOCKING_MISMATCH":"INSUFFICIENT_EVIDENCE") as ComparisonStatus,difference:null,explanation:"missing evidence"};if(f.expectedDifference)return{field:f.field,status:"EXPECTED_DIFFERENCE" as const,difference:null,explanation:"declared expected difference"};if(typeof f.authoritative==="number"&&typeof f.shadow==="number"){const d=Math.abs(f.authoritative-f.shadow);return{field:f.field,status:(d===0?"EXACT_MATCH":d<=(f.tolerance??0)?"TOLERANCE_MATCH":"MISMATCH") as ComparisonStatus,difference:d,explanation:d===0?null:`difference=${d}`};}const equal=JSON.stringify(f.authoritative)===JSON.stringify(f.shadow);return{field:f.field,status:(equal?"EXACT_MATCH":"MISMATCH") as ComparisonStatus,difference:null,explanation:equal?null:"values differ"};});
  const order:ComparisonStatus[]=["BLOCKING_MISMATCH","MISMATCH","INSUFFICIENT_EVIDENCE","EXPECTED_DIFFERENCE","TOLERANCE_MATCH","EXACT_MATCH"];
  return{status:order.find(s=>results.some(r=>r.status===s))??"EXACT_MATCH",fields:results};
}
