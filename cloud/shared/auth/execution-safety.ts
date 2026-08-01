import type { CloudConfig } from "../config/index.ts";
import type { CommandEnvelope } from "../contracts/events.ts";
export interface MutationPrerequisites { executionScopeValid:boolean; ownershipLeaseValid:boolean; supabaseTruthReconciled:boolean; }
export function authorizeProviderMutation(config:CloudConfig,command:CommandEnvelope,checks:MutationPrerequisites):void{
  if(!config.runtimeEnabled||!config.providerMutationEnabled)throw new Error("PROVIDER_MUTATION_DISABLED");
  if(config.environment==="prod"&&!config.productionExecutionEnabled)throw new Error("PRODUCTION_EXECUTION_DISABLED");
  if(!command.authorized)throw new Error("COMMAND_NOT_AUTHORIZED");
  if(!command.correlation_id||!command.idempotency_key)throw new Error("COMMAND_SAFETY_FIELDS_REQUIRED");
  if(!checks.executionScopeValid||!command.execution_scope_key)throw new Error("EXECUTION_SCOPE_INVALID");
  if(!checks.ownershipLeaseValid)throw new Error("RUNTIME_OWNERSHIP_LEASE_REQUIRED");
  if(!checks.supabaseTruthReconciled)throw new Error("SUPABASE_TRUTH_RECONCILIATION_REQUIRED");
}
