export const SHADOW_MODE = "shadow" as const;
export interface ShadowEnvelope<T = unknown> {
  event_id: string;
  event_version: 1;
  environment: "demo";
  runtime_mode: "shadow";
  mutation_authorized: false;
  shadow_runtime_id: string;
  correlation_id: string;
  occurred_at: string;
  payload: T;
}
export function validateShadowEnvelope(value: unknown): ShadowEnvelope {
  if (!value || typeof value !== "object") throw new Error("SHADOW_ENVELOPE_REQUIRED");
  const row=value as Record<string,unknown>;
  if(row.environment!=="demo"||row.runtime_mode!=="shadow"||row.mutation_authorized!==false)throw new Error("SHADOW_SAFETY_FIELDS_INVALID");
  for(const key of ["event_id","shadow_runtime_id","correlation_id","occurred_at"]){if(typeof row[key]!=="string"||!row[key])throw new Error(`SHADOW_FIELD_REQUIRED:${key}`);}
  if(row.event_version!==1)throw new Error("SHADOW_VERSION_UNSUPPORTED");
  return row as unknown as ShadowEnvelope;
}
export interface ShadowEvidence {
  shadow_runtime_id:string;source_signal_id:string|null;authoritative_result_ref:string;
  google_result:Readonly<Record<string,unknown>>;comparison_status:ComparisonStatus;
  policy_version:string;strategy_version:string;account_policy_version:string;
  correlation_id:string;timestamp:string;mismatch_explanation:string|null;mutation_authorized:false;
}
export type ComparisonStatus="EXACT_MATCH"|"TOLERANCE_MATCH"|"EXPECTED_DIFFERENCE"|"MISMATCH"|"BLOCKING_MISMATCH"|"INSUFFICIENT_EVIDENCE";
