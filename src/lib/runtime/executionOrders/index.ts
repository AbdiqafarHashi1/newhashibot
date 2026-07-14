import { EXECUTION_STATUSES, isExecutionStatus, type ExecutionStatus, type ProviderId, type EnvironmentId } from '../../runtimeContracts/index.js';

export { EXECUTION_STATUSES, isExecutionStatus };
export type { ExecutionStatus };

export interface ExecutionOrderRecord {
  execution_order_id: string;
  trade_id?: string | null;
  signal_id?: string | null;
  provider_id: ProviderId | string;
  environment_id: EnvironmentId | string;
  account_id?: string | null;
  symbol: string;
  order_role: 'entry' | 'exit' | 'stop_loss' | 'take_profit_1' | 'take_profit_2' | 'break_even_stop' | 'repair_exit';
  execution_status: ExecutionStatus;
  provider_order_id?: string | null;
  provider_status?: string | null;
  idempotency_key: string;
  updated_at: string;
}

const LEGACY_EXECUTION_STATUS_MAP: Record<string, ExecutionStatus | 'ambiguous'> = {
  pending: 'created',
  entry_submitted: 'submitted',
  submitted: 'submitted',
  entry_accepted: 'accepted',
  accepted: 'accepted',
  entry_filled: 'filled',
  filled: 'filled',
  partially_filled: 'partially_filled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  rejected: 'rejected',
  failed: 'failed',
  entry_timeout_cancelled: 'cancelled',
  entry_missing_no_position: 'expired',
  protected_native: 'ambiguous',
  protected_managed: 'ambiguous',
  pending_protection: 'ambiguous',
  protection_failed: 'ambiguous',
  partially_closed: 'ambiguous',
  closed_tp2: 'ambiguous',
  closed_sl: 'ambiguous',
  closed_profit_lock: 'ambiguous',
};

export function normalizeExecutionOrderStatus(value: unknown): { ok: true; status: ExecutionStatus } | { ok: false; ambiguous: boolean; error: string } {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return { ok: false, ambiguous: false, error: 'missing_execution_status' };
  if (isExecutionStatus(raw)) return { ok: true, status: raw };
  const mapped = LEGACY_EXECUTION_STATUS_MAP[raw];
  if (mapped && mapped !== 'ambiguous') return { ok: true, status: mapped };
  return { ok: false, ambiguous: mapped === 'ambiguous', error: `unsupported_execution_status:${raw}` };
}

export function assertExecutionOnlyStatus(value: unknown): ExecutionStatus {
  const normalized = normalizeExecutionOrderStatus(value);
  if (!normalized.ok) throw new Error((normalized as { error: string }).error);
  return normalized.status;
}
