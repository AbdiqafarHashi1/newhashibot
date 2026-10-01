import { observeShadowCycles, type ShadowAdapter, type ShadowCheckpointStore } from "./shadow-observer.ts";
import type { ApprovedReplayConfiguration } from "./active-validation-runtime.ts";

export interface ShadowRunStateStore extends ShadowCheckpointStore { updateRun(runId:string,row:Record<string,unknown>):Promise<void> }

/** Portable, server-authorized worker boundary. Scheduling is deliberately external and disabled. */
export async function executeShadowWorker(input:{runId:string;adapter:ShadowAdapter;store:ShadowRunStateStore;configuration:ApprovedReplayConfiguration;configurationHash:string;maxCycles:number;maxRequests:number;maxDurationMs:number}) {
  await input.store.updateRun(input.runId,{status:"RUNNING",failure_code:null});
  try {
    const result=await observeShadowCycles(input);
    await input.store.updateRun(input.runId,{status:result.status==="OBSERVED"?"RUNNING":"AWAITING_FEED",progress_completed:result.completed,failure_code:result.status==="AWAITING_FEED"?"NO_NEW_CLOSED_CANDLES":null});
    return result;
  } catch(error) {
    const message=error instanceof Error?error.message:String(error),cancelled=message==="SHADOW_CANCELLED";
    await input.store.updateRun(input.runId,{status:cancelled?"CANCELLED":"FAILED",failure_code:message.slice(0,300),finished_at:new Date().toISOString()});
    throw error;
  }
}
