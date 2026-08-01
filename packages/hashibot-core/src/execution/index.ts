export * from "../../../../supabase/functions/_shared/professional-execution-planning.ts";
export interface ExecutionPlanRepository<T>{load(planId:string):Promise<T|null>;save(plan:T):Promise<void>;}
