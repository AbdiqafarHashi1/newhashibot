import type { EventEnvelope } from "../contracts/events.ts";
export interface TraceContext { correlationId:string; causationId:string|null; }
export const traceFromEnvelope=(event:EventEnvelope):TraceContext=>({correlationId:event.correlation_id,causationId:event.causation_id});
